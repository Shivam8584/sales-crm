import { describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { sha256Hex } from "../../convex/lib/crypto";
import { READ, WRITE } from "../../convex/lib/mcpTools";
import { TOOLS, toolsFor } from "../../lib/domain/mcp";
import {
  failureCode,
  makeTest,
  newAccount,
  newPerson,
  seedTeam,
  type Actor,
  type T,
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

async function act(
  t: T,
  tokenId: Id<"apiTokens">,
  tool: string,
  input: Record<string, unknown>,
) {
  const out = await t.mutation(internal.mcp.write, { tokenId, tool, input });
  if (!("text" in out)) throw new Error("rate limited");
  return JSON.parse(out.text);
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
    const out = await act(t, tokenId, "create_task", { title: "Call Priya" });
    expect(out).toMatchObject({ title: "Call Priya" });
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

describe("MCP write tools", () => {
  async function setup() {
    const t = makeTest();
    const team = await seedTeam(t);
    const { tokenId } = await tokenFor(team.rep, "write");
    const accountId = await newAccount(team.rep, "Globex Traders");
    return { t, tokenId, accountId, ...team };
  }
  const entries = (t: T) => t.run((ctx) => ctx.db.query("timeline").collect());

  it("refuse every write tool for a read-only token", async () => {
    const t = makeTest();
    const { rep } = await seedTeam(t);
    const { tokenId } = await tokenFor(rep, "read");
    for (const tool of TOOLS.filter((item) => item.access === "write")) {
      expect(
        await failureCode(
          t.mutation(internal.mcp.write, {
            tokenId,
            tool: tool.name,
            input: {},
          }),
        ),
        tool.name,
      ).toBe("forbidden");
    }
    expect(await entries(t)).toEqual([]);
  });

  it("write a note as the owner, marked with the token's name, and undo it", async () => {
    const { t, tokenId, accountId, rep } = await setup();
    const note = await act(t, tokenId, "create_note", {
      target: { type: "account", id: accountId },
      body: "Wants a demo",
    });
    const [entry] = (await entries(t)).filter((item) => item.kind === "note");
    expect(entry).toMatchObject({ actorId: rep.id, via: "Claude", accountId });
    expect(entry._id).toBe(note.id);

    const [write] = await rep.as.query(api.tokens.writes, {});
    expect(write).toMatchObject({ token: "Claude", undoable: true });
    await rep.as.mutation(api.tokens.undo, { id: write._id });
    expect((await entries(t)).filter((item) => item.kind === "note")).toEqual(
      [],
    );
    expect(
      await failureCode(rep.as.mutation(api.tokens.undo, { id: write._id })),
    ).toBe("conflict");
  });

  it("do a retried call once, and refuse a reused key for another request", async () => {
    const { t, tokenId } = await setup();
    const input = { title: "Call Priya", idempotencyKey: "req-1" };
    const first = await act(t, tokenId, "create_task", input);
    const second = await act(t, tokenId, "create_task", input);
    expect(second).toEqual(first);
    expect(await t.run((ctx) => ctx.db.query("tasks").collect())).toHaveLength(
      1,
    );
    expect(
      await failureCode(
        t.mutation(internal.mcp.write, {
          tokenId,
          tool: "create_task",
          input: { title: "Something else", idempotencyKey: "req-1" },
        }),
      ),
    ).toBe("conflict");
    expect(await t.run((ctx) => ctx.db.query("tasks").collect())).toHaveLength(
      1,
    );
  });

  it("complete a task and undo it", async () => {
    const { t, tokenId, rep } = await setup();
    const { id } = (await act(t, tokenId, "create_task", {
      title: "Send deck",
    })) as { id: Id<"tasks"> };
    await act(t, tokenId, "complete_task", { id });
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("done");
    const [latest] = await rep.as.query(api.tokens.writes, {});
    await rep.as.mutation(api.tokens.undo, { id: latest._id });
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("todo");
  });

  it("move a deal, require a reason for lost, and refuse an undo over newer work", async () => {
    const { t, tokenId, accountId, rep } = await setup();
    const dealId = await rep.as.mutation(api.deals.create, {
      title: "Q3 campaign",
      accountId,
    });
    expect(
      await failureCode(
        t.mutation(internal.mcp.write, {
          tokenId,
          tool: "update_deal_stage",
          input: { id: dealId, stage: "lost" },
        }),
      ),
    ).toBe("invalid");
    await act(t, tokenId, "update_deal_stage", {
      id: dealId,
      stage: "proposal",
    });
    expect((await t.run((ctx) => ctx.db.get(dealId)))?.stage).toBe("proposal");
    expect((await entries(t)).some((item) => item.via === "Claude")).toBe(true);

    const [latest] = await rep.as.query(api.tokens.writes, {});
    await rep.as.mutation(api.deals.update, {
      id: dealId,
      patch: { stage: "won" },
    });
    expect(
      await failureCode(rep.as.mutation(api.tokens.undo, { id: latest._id })),
    ).toBe("conflict");

    await rep.as.mutation(api.deals.update, {
      id: dealId,
      patch: { stage: "proposal" },
    });
    await rep.as.mutation(api.tokens.undo, { id: latest._id });
    expect((await t.run((ctx) => ctx.db.get(dealId)))?.stage).toBe("discovery");
  });

  it("add a tag once, keep the others, and undo it", async () => {
    const { t, tokenId, accountId, rep } = await setup();
    await rep.as.mutation(api.accounts.update, {
      id: accountId,
      patch: { tags: ["vip"] },
    });
    const target = { type: "account", id: accountId };
    await act(t, tokenId, "add_tag", { target, tag: "d2c" });
    const again = await act(t, tokenId, "add_tag", { target, tag: "D2C" });
    expect(again.unchanged).toBe(true);
    expect((await t.run((ctx) => ctx.db.get(accountId)))?.tags).toEqual([
      "vip",
      "d2c",
    ]);
    const writes = await rep.as.query(api.tokens.writes, {});
    expect(writes).toHaveLength(2);
    await rep.as.mutation(api.tokens.undo, { id: writes[1]._id });
    expect((await t.run((ctx) => ctx.db.get(accountId)))?.tags).toEqual([
      "vip",
    ]);
  });

  it("log a call on a person but never on an erased one", async () => {
    const { t, tokenId, rep } = await setup();
    const personId = await newPerson(rep, {
      firstName: "Priya",
      email: "priya@globex.in",
    });
    const out = await act(t, tokenId, "log_call", {
      target: { type: "person", id: personId },
      outcome: "connected",
      durationMin: 12,
    });
    const call = (await entries(t)).find((item) => item._id === out.id);
    expect(call).toMatchObject({
      kind: "call",
      outcome: "connected",
      durationMin: 12,
      via: "Claude",
    });
    await t.run((ctx) => ctx.db.patch(personId, { erasedAt: Date.now() }));
    expect(
      await failureCode(
        t.mutation(internal.mcp.write, {
          tokenId,
          tool: "log_call",
          input: { target: { type: "person", id: personId } },
        }),
      ),
    ).toBe("not_found");
  });

  it("add a lead, but point at the record that already exists instead of duplicating", async () => {
    const { t, tokenId, rep } = await setup();
    const lead = {
      name: "Asha Rao",
      companyName: "Rao Foods",
      email: "asha@raofoods.in",
    };
    await act(t, tokenId, "create_lead", lead);
    const leads = await t.run((ctx) => ctx.db.query("leads").collect());
    expect(leads).toHaveLength(1);
    expect(leads[0].ownerId).toBe(rep.id);
    expect(
      (await entries(t)).some(
        (item) => item.leadId === leads[0]._id && item.via === "Claude",
      ),
    ).toBe(true);
    expect(
      await failureCode(
        t.mutation(internal.mcp.write, {
          tokenId,
          tool: "create_lead",
          input: lead,
        }),
      ),
    ).toBe("conflict");

    await newPerson(rep, { firstName: "Dev", email: "dev@known.in" });
    expect(
      await failureCode(
        t.mutation(internal.mcp.write, {
          tokenId,
          tool: "create_lead",
          input: { name: "Dev K", companyName: "Known", email: "DEV@known.in" },
        }),
      ),
    ).toBe("conflict");
    expect(await t.run((ctx) => ctx.db.query("leads").collect())).toHaveLength(
      1,
    );
  });

  it("limit how fast a token can write", async () => {
    const { t, tokenId } = await setup();
    for (let i = 0; i < 20; i++) {
      await act(t, tokenId, "create_task", { title: `Task ${i}` });
    }
    const out = await t.mutation(internal.mcp.write, {
      tokenId,
      tool: "create_task",
      input: { title: "One too many" },
    });
    expect(out).toHaveProperty("retryAfter");
    expect(await t.run((ctx) => ctx.db.query("tasks").collect())).toHaveLength(
      20,
    );
  });

  it("only let a member undo their own tokens' changes", async () => {
    const { t, tokenId, otherRep, rep } = await setup();
    await act(t, tokenId, "create_task", { title: "Mine" });
    const [write] = await rep.as.query(api.tokens.writes, {});
    expect(await otherRep.as.query(api.tokens.writes, {})).toEqual([]);
    expect(
      await failureCode(
        otherRep.as.mutation(api.tokens.undo, { id: write._id }),
      ),
    ).toBe("not_found");
  });
});
