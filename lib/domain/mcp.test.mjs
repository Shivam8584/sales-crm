import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TOOLS,
  bearerToken,
  checkInput,
  classify,
  clip,
  findTool,
  generateToken,
  isTokenShape,
  negotiateVersion,
  rpcError,
  rpcResult,
  tokenPrefix,
  toolsFor,
} from "./mcp.ts";
import { sha256Hex } from "../../convex/lib/crypto.ts";

test("tokens are 256 random bits, url-safe, and unique", () => {
  const token = generateToken();
  assert.match(token, /^hdcrm_[A-Za-z0-9_-]{43}$/);
  assert.ok(isTokenShape(token));
  assert.notEqual(token, generateToken());
  assert.equal(tokenPrefix(token), token.slice(0, 8));
  assert.ok(!isTokenShape(token + "x"));
  assert.ok(!isTokenShape(token.slice(1)));
  assert.ok(!isTokenShape("nxtc_" + token.slice(6)));
});

test("a token hashes to 64 hex characters that never contain the token", async () => {
  const token = generateToken();
  const hash = await sha256Hex(token);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, await sha256Hex(token));
  assert.ok(!hash.includes(token.slice(6)));
  assert.equal(
    await sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("bearer parsing is strict about the scheme and a single token", () => {
  assert.equal(bearerToken("Bearer abc"), "abc");
  assert.equal(bearerToken("bearer abc"), "abc");
  assert.equal(bearerToken("Basic abc"), null);
  assert.equal(bearerToken("Bearer a b"), null);
  assert.equal(bearerToken("Bearer"), null);
  assert.equal(bearerToken(null), null);
});

test("the protocol version echoes a supported one, else the newest", () => {
  assert.equal(negotiateVersion("2025-03-26"), "2025-03-26");
  assert.equal(negotiateVersion("2025-06-18"), "2025-06-18");
  assert.equal(negotiateVersion("2024-11-05"), "2025-06-18");
  assert.equal(negotiateVersion(undefined), "2025-06-18");
  assert.equal(negotiateVersion(20250618), "2025-06-18");
});

test("JSON-RPC envelopes", () => {
  assert.deepEqual(rpcResult(1, { ok: true }), {
    jsonrpc: "2.0",
    id: 1,
    result: { ok: true },
  });
  assert.deepEqual(rpcError("a", -32601, "nope"), {
    jsonrpc: "2.0",
    id: "a",
    error: { code: -32601, message: "nope" },
  });
});

test("messages are sorted into request, notification and invalid", () => {
  assert.deepEqual(classify({ jsonrpc: "2.0", id: 7, method: "ping" }), {
    kind: "request",
    id: 7,
    method: "ping",
    params: undefined,
  });
  assert.equal(
    classify({ jsonrpc: "2.0", id: "x", method: "tools/list" }).kind,
    "request",
  );
  assert.equal(
    classify({ jsonrpc: "2.0", method: "notifications/initialized" }).kind,
    "notification",
  );
  assert.equal(
    classify({ jsonrpc: "2.0", id: 1, result: {} }).kind,
    "notification",
  );
  assert.deepEqual(classify({ jsonrpc: "1.0", id: 3, method: "ping" }), {
    kind: "invalid",
    id: 3,
  });
  assert.deepEqual(classify({ jsonrpc: "2.0", id: {}, method: "ping" }), {
    kind: "invalid",
    id: null,
  });
  assert.equal(classify([]).kind, "invalid");
  assert.equal(classify(null).kind, "invalid");
  assert.equal(classify("ping").kind, "invalid");
  assert.equal(classify({ jsonrpc: "2.0", id: 1 }).kind, "invalid");
});

test("read tokens never see write tools", () => {
  const read = toolsFor("read").map((tool) => tool.name);
  assert.ok(!read.includes("create_task") && !read.includes("add_note"));
  assert.equal(
    read.length,
    TOOLS.filter((tool) => tool.access === "read").length,
  );
  assert.deepEqual(
    toolsFor("write").map((tool) => tool.name),
    TOOLS.map((tool) => tool.name),
  );
  assert.equal(findTool("add_note")?.access, "write");
  assert.equal(findTool("drop_database"), undefined);
});

test("every tool declares a closed object schema", () => {
  const names = new Set();
  for (const tool of TOOLS) {
    assert.ok(!names.has(tool.name));
    names.add(tool.name);
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(tool.inputSchema.additionalProperties, false);
  }
});

test("input checks reject the wrong shape, size and unknown fields", () => {
  const search = findTool("search_records").inputSchema;
  assert.equal(checkInput(search, { query: "acme" }), null);
  assert.equal(checkInput(search, { query: "acme", types: ["lead"] }), null);
  assert.match(checkInput(search, {}), /query is required/);
  assert.match(checkInput(search, { query: "   " }), /too short/);
  assert.match(checkInput(search, { query: "x".repeat(101) }), /too long/);
  assert.match(checkInput(search, { query: 5 }), /must be a string/);
  assert.match(
    checkInput(search, { query: "a", extra: 1 }),
    /not a known field/,
  );
  assert.match(checkInput(search, { query: "a", types: ["user"] }), /one of/);
  assert.match(checkInput(search, null), /must be an object/);
  const tasks = findTool("list_my_tasks").inputSchema;
  assert.equal(checkInput(tasks, {}), null);
  assert.match(checkInput(tasks, { limit: 51 }), /too large/);
  assert.match(checkInput(tasks, { limit: 0 }), /too small/);
  assert.match(checkInput(tasks, { limit: 1.5 }), /integer/);
  assert.match(checkInput(tasks, { when: "never" }), /one of/);
  const note = findTool("add_note").inputSchema;
  assert.equal(
    checkInput(note, { target: { type: "lead", id: "abc" }, body: "hi" }),
    null,
  );
  assert.match(
    checkInput(note, { target: { type: "user", id: "abc" }, body: "hi" }),
    /target\.type/,
  );
  assert.match(
    checkInput(note, { target: { type: "lead" }, body: "hi" }),
    /target\.id is required/,
  );
});

test("clip keeps short text and marks cuts", () => {
  assert.equal(clip("  hi  "), "hi");
  assert.equal(clip(null), "");
  const long = clip("x".repeat(500));
  assert.equal(long.length, 300);
  assert.ok(long.endsWith("…"));
  assert.equal(clip("abcdef", 4), "abc…");
});
