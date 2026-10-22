import { fail } from "./errors";
import { EMBED_DIMS } from "./aiEmbedText";

type Env = Record<string, string | undefined>;

const endpoint = (env: Env, path: "responses" | "embeddings") =>
  `${(env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "")}/${path}`;
const TIMEOUT_MS = 20_000;
const RETRY_MS = 400;

export type Schema = {
  type: string | string[];
  enum?: readonly string[];
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: false;
};

export const text: Schema = { type: "string" };
export const nullableText: Schema = { type: ["string", "null"] };
export const choice = (values: readonly string[]): Schema => ({
  type: "string",
  enum: values,
});
export const list = (items: Schema): Schema => ({ type: "array", items });
export const object = (properties: Record<string, Schema>): Schema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/** Structured outputs are only as trustworthy as the model, so every reply is checked here too. */
export function matches(schema: Schema, value: unknown): boolean {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (value === null) return types.includes("null");
  if (typeof value === "string") {
    return (
      types.includes("string") && (!schema.enum || schema.enum.includes(value))
    );
  }
  if (Array.isArray(value)) {
    const { items } = schema;
    return (
      types.includes("array") &&
      Boolean(items) &&
      value.every((item) => matches(items!, item))
    );
  }
  if (typeof value !== "object") return false;
  const { properties = {}, required = [] } = schema;
  const record = value as Record<string, unknown>;
  return (
    types.includes("object") &&
    required.every(
      (key) => key in record && matches(properties[key], record[key]),
    ) &&
    Object.keys(record).every((key) => key in properties)
  );
}

export function aiModels(env: Env) {
  return {
    main: env.AI_MODEL?.trim() || "gpt-6.1-sol",
    fast: env.AI_MODEL_FAST?.trim() || "gpt-6-luna",
  };
}

type Reply = { ok: boolean; status: number; json: unknown };

async function post(
  fetcher: typeof fetch,
  env: Env,
  key: string,
  body: string,
  path: "responses" | "embeddings" = "responses",
): Promise<Reply> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher(endpoint(env, path), {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body,
      signal: controller.signal,
    });
    const json = response.ok ? await response.json() : null;
    return { ok: response.ok, status: response.status, json };
  } catch {
    return fail(
      "unavailable",
      controller.signal.aborted
        ? "AI took too long to answer. Try again."
        : "Couldn't reach the AI service. Try again.",
    );
  } finally {
    clearTimeout(timer);
  }
}

type Output = {
  status?: string;
  output_text?: unknown;
  output?: {
    type?: string;
    content?: { type?: string; text?: unknown }[];
  }[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

function outputText(json: Output) {
  if (json.status === "incomplete") {
    fail("unavailable", "AI ran out of room before it finished. Try again.");
  }
  let found = "";
  for (const item of json.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type === "refusal") fail("unavailable", "AI declined to answer");
      if (part.type === "output_text" && typeof part.text === "string") {
        found += part.text;
      }
    }
  }
  return (
    found || (typeof json.output_text === "string" ? json.output_text : "")
  );
}

/** One Responses API call whose reply must match `schema`; `fetcher` is injectable for tests. */
export async function generate<T>(
  options: {
    model: "main" | "fast";
    system: string;
    input: string;
    schema: { name: string; json: Schema };
    maxOutputTokens: number;
  },
  fetcher: typeof fetch = fetch,
  env: Env = process.env,
): Promise<T> {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) fail("unavailable", "AI is not set up on this server");
  const model = aiModels(env)[options.model];
  const body = JSON.stringify({
    model,
    instructions: options.system,
    input: options.input,
    store: false,
    max_output_tokens: options.maxOutputTokens,
    ...(/^(gpt-[56]|o\d)/.test(model) ? { reasoning: { effort: "low" } } : {}),
    text: {
      format: {
        type: "json_schema",
        name: options.schema.name,
        strict: true,
        schema: options.schema.json,
      },
    },
  });

  let reply = await post(fetcher, env, key, body);
  if (reply.status === 429 || reply.status >= 500) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    reply = await post(fetcher, env, key, body);
  }
  if (!reply.ok) {
    console.log("ai failed", model, reply.status);
    fail(
      "unavailable",
      reply.status === 429
        ? "AI is busy right now. Try again in a minute."
        : reply.status === 401 || reply.status === 403
          ? "The AI key on this server was not accepted"
          : "AI is unavailable right now. Try again.",
    );
  }

  const json = (reply.json ?? {}) as Output;
  console.log(
    "ai ok",
    model,
    json.usage?.input_tokens ?? 0,
    json.usage?.output_tokens ?? 0,
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText(json));
  } catch (error) {
    if (error instanceof SyntaxError) parsed = undefined;
    else throw error;
  }
  if (!matches(options.schema.json, parsed)) {
    fail("unavailable", "AI gave an answer we couldn't use. Try again.");
  }
  return parsed as T;
}

const MAX_EMBED_BATCH = 64;

export const embedModel = (env: Env = process.env) =>
  env.AI_EMBED_MODEL?.trim() || "text-embedding-3-small";

/** One vector per input, in order. The inputs are never logged. */
export async function embed(
  inputs: string[],
  fetcher: typeof fetch = fetch,
  env: Env = process.env,
): Promise<number[][]> {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) fail("unavailable", "AI is not set up on this server");
  if (inputs.length === 0 || inputs.length > MAX_EMBED_BATCH) {
    fail("unavailable", "Too many texts to embed at once");
  }
  const model = embedModel(env);
  const body = JSON.stringify({
    model,
    input: inputs,
    encoding_format: "float",
    ...(/^text-embedding-3/.test(model) ? { dimensions: EMBED_DIMS } : {}),
  });

  let reply = await post(fetcher, env, key, body, "embeddings");
  if (reply.status === 429 || reply.status >= 500) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    reply = await post(fetcher, env, key, body, "embeddings");
  }
  if (!reply.ok) {
    console.log("ai embed failed", model, reply.status);
    fail(
      "unavailable",
      reply.status === 401 || reply.status === 403
        ? "The AI key on this server was not accepted"
        : "AI is unavailable right now. Try again.",
    );
  }

  const data = (
    reply.json as { data?: { index?: number; embedding?: unknown }[] }
  )?.data;
  const vectors = [...(data ?? [])]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((item) => item.embedding);
  const valid = vectors.every(
    (vector) =>
      Array.isArray(vector) &&
      vector.length === EMBED_DIMS &&
      vector.every((value) => Number.isFinite(value)),
  );
  if (!valid || vectors.length !== inputs.length) {
    fail("unavailable", "AI gave an answer we couldn't use. Try again.");
  }
  console.log("ai embed ok", model, inputs.length);
  return vectors as number[][];
}
