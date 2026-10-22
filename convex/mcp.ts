import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  httpAction,
  internalMutation as rawInternalMutation,
  internalQuery,
} from "./_generated/server";
import {
  MAX_BODY_BYTES,
  RPC,
  bearerToken,
  checkInput,
  classify,
  clip,
  findTool,
  isSupportedVersion,
  isTokenShape,
  negotiateVersion,
  rpcError,
  rpcResult,
  toolsFor,
} from "../lib/domain/mcp";
import { sha256Hex } from "./lib/crypto";
import { fail } from "./lib/errors";
import { internalMutation } from "./lib/functions";
import { clientIp, json, readBody } from "./lib/http";
import { requireToken, validToken, viaToken } from "./lib/mcp";
import { READ, WRITE } from "./lib/mcpTools";
import { rateLimiter } from "./lib/rateLimiter";

const DAY = 24 * 60 * 60_000;
const RETENTION = 30 * DAY;
const TOUCH_EVERY = 60_000;
const MAX_OUTPUT = 40_000;
const TRIM_BATCH = 500;

const INSTRUCTIONS =
  "Hypedrive CRM. You act as the token's owner and see what they see. Ids come from search_records and the get_* tools. Write tools change real records as the owner and show in the timeline as done via this token; pass an idempotencyKey when retrying, and confirm with the user before acting on their behalf.";

/** No CORS headers on purpose: MCP clients are not browsers. */
const HEADERS = { "Cache-Control": "no-store" };

const asText = (value: unknown) => {
  const text = JSON.stringify(value);
  if (text.length > MAX_OUTPUT) fail("invalid", "That result is too large");
  return text;
};

export const authenticate = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const token = await ctx.db
      .query("apiTokens")
      .withIndex("by_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!token || !(await validToken(ctx, token._id))) return null;
    const now = Date.now();
    if (!token.lastUsedAt || now - token.lastUsedAt > TOUCH_EVERY) {
      await ctx.db.patch(token._id, { lastUsedAt: now });
    }
    return { tokenId: token._id, access: token.access };
  },
});

export const read = internalQuery({
  args: { tokenId: v.id("apiTokens"), tool: v.string(), input: v.any() },
  handler: async (ctx, { tokenId, tool, input }): Promise<string> => {
    const { member } = await requireToken(ctx, tokenId);
    const run = READ[tool];
    if (!run) fail("not_found", "Unknown tool");
    return asText(await run(ctx, member, input));
  },
});

export type WriteOutcome = { text: string } | { retryAfter: number };

/**
 * The raw builder on purpose: the app mutations it runs wrap `ctx.db` with the
 * count triggers themselves, and wrapping twice would count every write twice.
 * A rate-limited call is returned, not thrown, so the limiter's own write survives.
 */
export const write = rawInternalMutation({
  args: { tokenId: v.id("apiTokens"), tool: v.string(), input: v.any() },
  handler: async (ctx, { tokenId, tool, input }): Promise<WriteOutcome> => {
    const { token, member } = await requireToken(ctx, tokenId);
    if (token.access !== "write") fail("forbidden", "This token is read-only");
    const run = WRITE[tool];
    if (!run) fail("not_found", "Unknown tool");

    const { idempotencyKey: key, ...rest } = input as Record<string, unknown>;
    const inputHash = await sha256Hex(JSON.stringify([tool, rest]));
    if (typeof key === "string") {
      const prior = await ctx.db
        .query("mcpWrites")
        .withIndex("by_token_key", (q) =>
          q.eq("tokenId", tokenId).eq("key", key),
        )
        .unique();
      if (prior) {
        if (prior.inputHash !== inputHash) {
          fail(
            "conflict",
            "That idempotencyKey was already used for a different request",
          );
        }
        return { text: prior.result };
      }
    }

    const limited = await rateLimiter.limit(ctx, "mcpWrite", { key: tokenId });
    if (!limited.ok) return { retryAfter: limited.retryAfter };

    const done = await run(viaToken(ctx, token.name), member, rest);
    const text = asText(done.result);
    await ctx.db.insert("mcpWrites", {
      tokenId,
      memberId: member._id,
      tool,
      key: typeof key === "string" ? key : undefined,
      inputHash,
      result: text,
      summary: done.summary,
      undo: done.undo,
      at: Date.now(),
    });
    return { text };
  },
});

export const record = internalMutation({
  args: { tokenId: v.id("apiTokens"), tool: v.string(), ok: v.boolean() },
  handler: async (ctx, { tokenId, tool, ok }) => {
    const token = await ctx.db.get(tokenId);
    if (!token) return;
    await ctx.db.insert("mcpCalls", {
      tokenId,
      memberId: token.memberId,
      tool,
      ok,
      at: Date.now(),
    });
  },
});

export const trim = internalMutation({
  args: {},
  handler: async (ctx) => {
    const old = await ctx.db
      .query("mcpCalls")
      .withIndex("by_at", (q) => q.lt("at", Date.now() - RETENTION))
      .take(TRIM_BATCH);
    for (const row of old) await ctx.db.delete(row._id);
    const writes = await ctx.db
      .query("mcpWrites")
      .withIndex("by_at", (q) => q.lt("at", Date.now() - RETENTION))
      .take(TRIM_BATCH);
    for (const row of writes) await ctx.db.delete(row._id);
    if (old.length === TRIM_BATCH || writes.length === TRIM_BATCH) {
      await ctx.scheduler.runAfter(0, internal.mcp.trim, {});
    }
  },
});

function failure(error: unknown) {
  const data = error instanceof ConvexError ? (error.data as unknown) : null;
  if (data && typeof data === "object" && "message" in data) {
    return clip(String(data.message), 200);
  }
  console.error("mcp tool failed", error);
  return "Something went wrong";
}

const toolResult = (text: string, isError: boolean) => ({
  content: [{ type: "text", text }],
  isError,
});

export const methodNotAllowed = httpAction(
  async () =>
    new Response(null, { status: 405, headers: { Allow: "POST", ...HEADERS } }),
);

export const endpoint = httpAction(async (ctx, request) => {
  if (request.headers.get("Origin")) {
    return json({ error: "Browser origins are not allowed" }, 403, HEADERS);
  }
  const given = bearerToken(request.headers.get("Authorization"));
  const auth =
    given && isTokenShape(given)
      ? await ctx.runMutation(internal.mcp.authenticate, {
          tokenHash: await sha256Hex(given),
        })
      : null;
  if (!auth) {
    // Only failures count, so a valid token is never locked out by a noisy neighbour.
    const failed = await rateLimiter.limit(ctx, "mcpAuthFail", {
      key: clientIp(request),
    });
    return failed.ok
      ? json({ error: "Unauthorized" }, 401, {
          ...HEADERS,
          "WWW-Authenticate": "Bearer",
        })
      : json({ error: "Too many failed attempts" }, 429, {
          ...HEADERS,
          "Retry-After": String(Math.ceil(failed.retryAfter / 1000)),
        });
  }
  const limited = await rateLimiter.limit(ctx, "mcp", { key: auth.tokenId });
  if (!limited.ok) {
    return json(rpcError(null, -32000, "Rate limit exceeded"), 429, {
      ...HEADERS,
      "Retry-After": String(Math.ceil((limited.retryAfter ?? 60_000) / 1000)),
    });
  }
  const header = request.headers.get("MCP-Protocol-Version");
  if (header && !isSupportedVersion(header)) {
    return json(
      rpcError(null, RPC.invalidRequest, "Unsupported protocol version"),
      400,
      HEADERS,
    );
  }

  const body = await readBody(request, MAX_BODY_BYTES);
  if (!body.ok) {
    return json(
      rpcError(null, RPC.invalidRequest, body.error),
      body.status,
      HEADERS,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.raw);
  } catch {
    return json(rpcError(null, RPC.parse, "Parse error"), 400, HEADERS);
  }
  const message = classify(parsed);
  if (message.kind === "notification") {
    return new Response(null, { status: 202, headers: HEADERS });
  }
  if (message.kind === "invalid") {
    return json(
      rpcError(message.id, RPC.invalidRequest, "Invalid request"),
      400,
      HEADERS,
    );
  }

  const { id } = message;
  const reply = (payload: unknown) => json(payload, 200, HEADERS);
  switch (message.method) {
    case "initialize": {
      const params = message.params as
        | { protocolVersion?: unknown }
        | undefined;
      return reply(
        rpcResult(id, {
          protocolVersion: negotiateVersion(params?.protocolVersion),
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "hypedrive-crm", version: "1.0.0" },
          instructions: INSTRUCTIONS,
        }),
      );
    }
    case "ping":
      return reply(rpcResult(id, {}));
    case "tools/list":
      return reply(
        rpcResult(id, {
          tools: toolsFor(auth.access).map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: {
              readOnlyHint: tool.access === "read",
              destructiveHint: false,
              openWorldHint: false,
            },
          })),
        }),
      );
    case "tools/call": {
      const params = message.params as
        | { name?: unknown; arguments?: unknown }
        | undefined;
      const tool = findTool(params?.name);
      if (!tool) {
        return reply(rpcError(id, RPC.invalidParams, "Unknown tool"));
      }
      const input = params?.arguments ?? {};
      let outcome: ReturnType<typeof toolResult>;
      const problem = checkInput(tool.inputSchema, input);
      if (problem) {
        outcome = toolResult(problem, true);
      } else if (tool.access === "write" && auth.access !== "write") {
        outcome = toolResult(
          "This token is read-only. Create a Read & write token to use this tool.",
          true,
        );
      } else {
        try {
          const args = { tokenId: auth.tokenId, tool: tool.name, input };
          if (tool.access === "write") {
            const done = await ctx.runMutation(internal.mcp.write, args);
            outcome =
              "text" in done
                ? toolResult(done.text, false)
                : toolResult(
                    `Too many changes at once. Try again in ${Math.ceil(done.retryAfter / 1000)} seconds.`,
                    true,
                  );
          } else {
            outcome = toolResult(
              await ctx.runQuery(internal.mcp.read, args),
              false,
            );
          }
        } catch (error) {
          outcome = toolResult(failure(error), true);
        }
      }
      await ctx.runMutation(internal.mcp.record, {
        tokenId: auth.tokenId,
        tool: tool.name,
        ok: !outcome.isError,
      });
      return reply(rpcResult(id, outcome));
    }
    default:
      return reply(rpcError(id, RPC.methodNotFound, "Method not found"));
  }
});
