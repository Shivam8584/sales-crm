import { describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { sha256Hex } from "../../convex/lib/crypto";
import { READ, WRITE } from "../../convex/lib/mcpTools";
import { TOOLS, toolsFor } from "../../lib/domain/mcp";
import {
  failureCode,
  makeTest,
  newAccount,
  seedTeam,
  type Actor,
} from "./setup";

async function tokenFor(
  owner: Actor,
  access: "read" | "write",
  expiresInDays?: number,
) {
  const { id, token } = await owner.as.mutation(api.tokens.create, {
    name: "Claude",
    access,
    expiresInDays,
  });
  return { tokenId: id, token };
}

describe("API tokens", () => {
  it("are shown once and stored only as a hash", async () => {
    const t = makeTest();
    const { rep } = await seedTeam(t);
    const { tokenId, token } = await tokenFor(rep, "read");
    const row = await t.run((ctx) => ctx.db.get(tokenId));
    expect(row?.tokenHash).toBe(await sha256Hex(token));
    expect(JSON.stringify(row)).not.toContain(token);
    const listed = await rep.as.query(api.tokens.list, {});
    expect(JSON.stringify(listed)).not.toContain(token);
  });

  it("authenticate by hash and stop working once revoked", async () => {
    const t = makeTest();
    const { rep } = await seedTeam(t);
    const { tokenId, token } = await tokenFor(rep, "write");
    const tokenHash = await sha256Hex(token);
    expect(await t.mutation(internal.mcp.authenticate, { tokenHash })).toEqual({
      tokenId,
      access: "write",
    });
    await rep.as.mutation(api.tokens.revoke, { id: tokenId });
    expect(
      await t.mutation(internal.mcp.authenticate, { tokenHash }),
    ).toBeNull();
    expect(
      await failureCode(
        t.query(internal.mcp.read, {
          tokenId,
          tool: "todays_summary",
          input: {},
        }),
      ),
    ).toBe("unauthenticated");
  });

  it("stop working when they expire", async () => {
    const t = makeTest();
    const { rep } = await seedTeam(t);
    const { tokenId, token } = await tokenFor(rep, "read", 1);
    const tokenHash = await sha256Hex(token);
    expect(
      await t.mutation(internal.mcp.authenticate, { tokenHash }),
    ).not.toBeNull();
    vi.setSystemTime(Date.now() + 2 * 24 * 60 * 60_000);
    expect(
      await t.mutation(internal.mcp.authenticate, { tokenHash }),
    ).toBeNull();
    expect(
      await failureCode(
        t.query(internal.mcp.read, {
          tokenId,
          tool: "todays_summary",
          input: {},
        }),
      ),
    ).toBe("unauthenticated");
  });

  it("stop working when their member is deactivated", async () => {
    const t = makeTest();
    const { rep } = await seedTeam(t);
    const { token } = await tokenFor(rep, "read");
    await t.run((ctx) => ctx.db.patch(rep.id, { status: "deactivated" }));
    expect(
      await t.mutation(internal.mcp.authenticate, {
        tokenHash: await sha256Hex(token),
      }),
    ).toBeNull();
  });

  it("can be revoked by their owner or an admin, not by another rep", async () => {
    const t = makeTest();
    const { rep, otherRep, admin } = await seedTeam(t);
    const { tokenId } = await tokenFor(rep, "read");
    expect(
      await failureCode(
        otherRep.as.mutation(api.tokens.revoke, { id: tokenId }),
      ),
    ).toBe("forbidden");
    await admin.as.mutation(api.tokens.revoke, { id: tokenId });
    const row = await t.run((ctx) => ctx.db.get(tokenId));
    expect(row?.revokedAt).toBeTypeOf("number");
  });
});

describe("MCP tools", () => {
  it("show a read token only the read tools", () => {
    const readNames = toolsFor("read").map((tool) => tool.name);
    expect(readNames.length).toBeGreaterThan(0);
    for (const name of readNames) expect(WRITE[name]).toBeUndefined();
    expect(toolsFor("write")).toHaveLength(TOOLS.length);
  });

  it("are all implemented, under the access they advertise", () => {
    for (const tool of TOOLS) {
      const table = tool.access === "write" ? WRITE : READ;
      expect(table[tool.name], tool.name).toBeTypeOf("function");
    }
  });

  it("refuse a write tool for a read-only token", async () => {
    const t = makeTest();
    const { rep } = await seedTeam(t);
    const { tokenId } = await tokenFor(rep, "read");
    expect(
      await failureCode(
        t.mutation(internal.mcp.write, {
          tokenId,
          tool: "create_task",
          input: { title: "Call Priya" },
        }),
      ),
    ).toBe("forbidden");
    expect(await t.run((ctx) => ctx.db.query("tasks").collect())).toEqual([]);
  });

  it("let a write token act as its member", async () => {
    const t = makeTest();
    const { rep } = await seedTeam(t);
    const { tokenId } = await tokenFor(rep, "write");
    const out = await t.mutation(internal.mcp.write, {
      tokenId,
      tool: "create_task",
      input: { title: "Call Priya" },
    });
    expect(JSON.parse(out)).toMatchObject({ title: "Call Priya" });
    const tasks = await t.run((ctx) => ctx.db.query("tasks").collect());
    expect(tasks).toHaveLength(1);
    expect(tasks[0].assigneeId).toBe(rep.id);
  });

  it("find records the member can see", async () => {
    const t = makeTest();
    const { rep } = await seedTeam(t);
    await newAccount(rep, "Globex Traders");
    const { tokenId } = await tokenFor(rep, "read");
    const out = await t.query(internal.mcp.read, {
      tokenId,
      tool: "search_records",
      input: { query: "Globex" },
    });
    expect(JSON.parse(out).accounts).toHaveLength(1);
  });
});
