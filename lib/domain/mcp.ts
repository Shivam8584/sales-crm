import { PRIORITIES } from "./enums";

/**
 * The MCP server's wire contract: token format, JSON-RPC envelopes and the
 * tool catalogue. Pure, so it is shared by the Convex endpoint and its tests.
 */

export const TOKEN_PREFIX = "hdcrm_";
export const TOKEN_ACCESS = ["read", "write"] as const;
export type TokenAccess = (typeof TOKEN_ACCESS)[number];

export const MAX_LIVE_TOKENS = 10;
export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_TEXT = 300;
export const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26"] as const;

const TOKEN_SHAPE = /^hdcrm_[A-Za-z0-9_-]{43}$/;

function base64url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** `hdcrm_` and 32 random bytes; shown once and stored only as a hash. */
export function generateToken() {
  return TOKEN_PREFIX + base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export const isTokenShape = (value: string) => TOKEN_SHAPE.test(value);

/** What the list shows to tell tokens apart. */
export const tokenPrefix = (token: string) => token.slice(0, 8);

export function bearerToken(header: string | null) {
  const match = /^Bearer +(\S+)$/i.exec(header?.trim() ?? "");
  return match?.[1] ?? null;
}

export function negotiateVersion(requested: unknown) {
  return (
    SUPPORTED_VERSIONS.find((version) => version === requested) ??
    SUPPORTED_VERSIONS[0]
  );
}

export const isSupportedVersion = (value: string) =>
  (SUPPORTED_VERSIONS as readonly string[]).includes(value);

/** Truncates untrusted text so one record can't flood a model's context. */
export function clip(text: string | null | undefined, max = MAX_TEXT) {
  const value = (text ?? "").trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export const RPC = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
} as const;

type RpcId = string | number | null;

export const rpcResult = (id: RpcId, result: unknown) => ({
  jsonrpc: "2.0" as const,
  id,
  result,
});

export const rpcError = (id: RpcId, code: number, message: string) => ({
  jsonrpc: "2.0" as const,
  id,
  error: { code, message },
});

export type RpcMessage =
  | { kind: "request"; id: string | number; method: string; params: unknown }
  | { kind: "notification" }
  | { kind: "invalid"; id: RpcId };

/** Sorts one parsed JSON body into what the endpoint must answer. */
export function classify(body: unknown): RpcMessage {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { kind: "invalid", id: null };
  }
  const message = body as Record<string, unknown>;
  const id = message.id;
  const validId = typeof id === "string" || typeof id === "number";
  if (message.jsonrpc !== "2.0") {
    return { kind: "invalid", id: validId ? id : null };
  }
  if (typeof message.method !== "string") {
    // A client's reply to a server request, which a stateless server never makes.
    return "result" in message || "error" in message
      ? { kind: "notification" }
      : { kind: "invalid", id: validId ? id : null };
  }
  if (id === undefined) return { kind: "notification" };
  if (!validId) return { kind: "invalid", id: null };
  return {
    kind: "request",
    id,
    method: message.method,
    params: message.params,
  };
}

export type Schema = {
  type: "string" | "integer" | "array" | "object";
  description?: string;
  enum?: readonly string[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  items?: Schema;
  maxItems?: number;
  properties?: Record<string, Schema>;
  required?: readonly string[];
  additionalProperties?: false;
};

/** The first problem with `value` against the schema subset the tools use, or null. */
export function checkInput(
  schema: Schema,
  value: unknown,
  path = "arguments",
): string | null {
  switch (schema.type) {
    case "string": {
      if (typeof value !== "string") return `${path} must be a string`;
      const length = value.trim().length;
      if (schema.enum && !schema.enum.includes(value)) {
        return `${path} must be one of: ${schema.enum.join(", ")}`;
      }
      if (length < (schema.minLength ?? 0)) return `${path} is too short`;
      if (length > (schema.maxLength ?? Infinity)) return `${path} is too long`;
      return null;
    }
    case "integer":
      if (typeof value !== "number" || !Number.isInteger(value)) {
        return `${path} must be an integer`;
      }
      if (value < (schema.minimum ?? -Infinity)) return `${path} is too small`;
      if (value > (schema.maximum ?? Infinity)) return `${path} is too large`;
      return null;
    case "array": {
      if (!Array.isArray(value)) return `${path} must be an array`;
      if (value.length > (schema.maxItems ?? Infinity)) {
        return `${path} has too many items`;
      }
      for (const [index, item] of value.entries()) {
        const problem = checkInput(schema.items!, item, `${path}[${index}]`);
        if (problem) return problem;
      }
      return null;
    }
    case "object": {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return `${path} must be an object`;
      }
      const fields = value as Record<string, unknown>;
      const known = schema.properties ?? {};
      for (const name of schema.required ?? []) {
        if (fields[name] === undefined) return `${path}.${name} is required`;
      }
      for (const [name, field] of Object.entries(fields)) {
        if (field === undefined) continue;
        if (!(name in known)) return `${path}.${name} is not a known field`;
        const problem = checkInput(known[name], field, `${path}.${name}`);
        if (problem) return problem;
      }
      return null;
    }
  }
}

export type ToolDef = {
  name: string;
  description: string;
  access: TokenAccess;
  inputSchema: Schema & { type: "object" };
};

const text = (description: string, maxLength = 100): Schema => ({
  type: "string",
  description,
  minLength: 1,
  maxLength,
});
const recordId = (what: string) => text(`The ${what} id`, 64);
const object = (
  properties: Record<string, Schema>,
  required: string[] = [],
): ToolDef["inputSchema"] => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export const RECORD_TYPES = ["account", "person", "lead", "deal"] as const;
const TASK_WHEN = ["overdue", "today", "upcoming", "all"] as const;

export const TOOLS: ToolDef[] = [
  {
    name: "search_records",
    description:
      "Find accounts, people, leads and deals by name. Returns at most 5 of each type.",
    access: "read",
    inputSchema: object(
      {
        query: text("Name, company or title to look for"),
        types: {
          type: "array",
          description: "Limit the search to these record types",
          items: { type: "string", enum: RECORD_TYPES },
          maxItems: 4,
        },
      },
      ["query"],
    ),
  },
  {
    name: "get_account",
    description:
      "An account with its stage, owner, people, open deals, open tasks, Hypedrive platform status and latest timeline entries.",
    access: "read",
    inputSchema: object({ id: recordId("account") }, ["id"]),
  },
  {
    name: "get_person",
    description:
      "A person with their contact details, account, open tasks and latest timeline entries.",
    access: "read",
    inputSchema: object({ id: recordId("person") }, ["id"]),
  },
  {
    name: "get_lead",
    description:
      "A lead with its status, owner, contact details and latest timeline entries.",
    access: "read",
    inputSchema: object({ id: recordId("lead") }, ["id"]),
  },
  {
    name: "get_deal",
    description:
      "A deal with its stage, amount, owner, account and latest timeline entries.",
    access: "read",
    inputSchema: object({ id: recordId("deal") }, ["id"]),
  },
  {
    name: "list_my_tasks",
    description: "Open tasks assigned to the token's owner, most urgent first.",
    access: "read",
    inputSchema: object({
      when: {
        type: "string",
        description: "Which tasks to list; defaults to all",
        enum: TASK_WHEN,
      },
      limit: {
        type: "integer",
        description: "Defaults to 20",
        minimum: 1,
        maximum: 50,
      },
    }),
  },
  {
    name: "todays_summary",
    description:
      "The token owner's Today view: counts and the first items of leads waiting, overdue and due-today tasks, stuck brands and deals closing this week.",
    access: "read",
    inputSchema: object({}),
  },
  {
    name: "list_sequences",
    description: "Every email/WhatsApp sequence with its status and trigger.",
    access: "read",
    inputSchema: object({}),
  },
  {
    name: "get_sequence",
    description: "A sequence's trigger and steps in flow order, with titles.",
    access: "read",
    inputSchema: object({ id: recordId("sequence") }, ["id"]),
  },
  {
    name: "read_sequence_log",
    description: "The latest log lines of a sequence's runs, newest first.",
    access: "read",
    inputSchema: object(
      {
        id: recordId("sequence"),
        limit: {
          type: "integer",
          description: "Defaults to 20",
          minimum: 1,
          maximum: 50,
        },
      },
      ["id"],
    ),
  },
  {
    name: "create_task",
    description:
      "Create a task assigned to the token's owner, optionally linked to one account, person, lead or deal.",
    access: "write",
    inputSchema: object(
      {
        title: text("What to do", 200),
        dueDate: text("Due day as YYYY-MM-DD", 10),
        priority: {
          type: "string",
          description: "Defaults to normal",
          enum: PRIORITIES,
        },
        accountId: recordId("account"),
        personId: recordId("person"),
        leadId: recordId("lead"),
        dealId: recordId("deal"),
      },
      ["title"],
    ),
  },
  {
    name: "add_note",
    description:
      "Add a note to an account, person, lead or deal timeline, written as the token's owner.",
    access: "write",
    inputSchema: object(
      {
        target: object(
          {
            type: {
              type: "string",
              description: "The kind of record",
              enum: RECORD_TYPES,
            },
            id: recordId("record"),
          },
          ["type", "id"],
        ),
        body: text("The note", 5000),
      },
      ["target", "body"],
    ),
  },
];

export const toolsFor = (access: TokenAccess) =>
  access === "write" ? TOOLS : TOOLS.filter((tool) => tool.access === "read");

export const findTool = (name: unknown) =>
  TOOLS.find((tool) => tool.name === name);
