import { describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { generateToken } from "../../lib/domain/mcp";
import {
  failureCode,
  makeTest,
  newAccount,
  newPerson,
  seedTeam,
  type T,
} from "./setup";

async function erasedPerson() {
  const t = makeTest();
  const team = await seedTeam(t);
  const accountId = await newAccount(team.rep, "Globex");
  const keptId = await newPerson(team.rep, {
    firstName: "Rohan",
    lastName: "Shah",
    email: "rohan@globex.com",
    accountId,
  });
  const personId = await newPerson(team.rep, {
    firstName: "Priya",
    lastName: "Nair",
    email: "priya@globex.com",
    accountId,
  });
  await t.run(async (ctx) => {
    for (const id of [personId, keptId]) {
      await ctx.db.insert("timeline", {
        kind: "note",
        personId: id,
        accountId,
        actorId: team.rep.id,
        occurredAt: Date.now(),
        body: "Asked about pricing",
      });
    }
  });
  await team.admin.as.mutation(api.consents.erase, {
    personId,
    confirmation: "erase",
  });
  return { t, team, accountId, personId, keptId };
}

const mcpSearch = async (t: T, memberId: Id<"members">, query: string) => {
  const token = generateToken();
  const tokenId = await t.run((ctx) =>
    ctx.db.insert("apiTokens", {
      memberId,
      name: "test",
      tokenHash: "unused",
      prefix: token.slice(0, 8),
      access: "read",
      createdAt: Date.now(),
    }),
  );
  const out = await t.query(internal.mcp.read, {
    tokenId,
    tool: "search_records",
    input: { query },
  });
  return JSON.parse(out) as { people: { id: string }[] };
};

describe("erased people", () => {
  it("disappear from record search", async () => {
    const { team, personId, keptId } = await erasedPerson();
    const found = await team.rep.as.query(api.shell.search, {
      search: "Globex",
    });
    const ids = found!.people.map((person) => person._id);
    expect(ids).not.toContain(personId);
    expect(ids).toContain(keptId);
    const byName = await team.rep.as.query(api.shell.search, {
      search: "Priya",
    });
    expect(byName!.people).toEqual([]);
  });

  it("disappear from the activity feed", async () => {
    const { team, personId, keptId } = await erasedPerson();
    const feed = await team.rep.as.query(api.activity.feed, {
      paginationOpts: { numItems: 50, cursor: null },
      kind: "all",
    });
    const refs = feed.page.map((entry) => JSON.stringify(entry));
    expect(refs.some((entry) => entry.includes(personId))).toBe(false);
    expect(refs.some((entry) => entry.includes(keptId))).toBe(true);
  });

  it("are refused as AI context and left out of the account's context", async () => {
    const { team, accountId, personId } = await erasedPerson();
    expect(
      await failureCode(
        team.rep.as.query(api.ai.targetContext, { target: { personId } }),
      ),
    ).toBe("forbidden");
    const context = await team.rep.as.query(api.ai.accountContext, {
      accountId,
    });
    expect(context.people.map((person) => person.name)).toEqual(["Rohan Shah"]);
    expect(JSON.stringify(context.timeline)).not.toContain("Priya");
  });

  it("do not come back from the MCP search tool", async () => {
    const { t, team, personId } = await erasedPerson();
    const found = await mcpSearch(t, team.rep.id, "globex");
    expect(found.people.map((person) => person.id)).not.toContain(personId);
    expect(found.people).toHaveLength(1);
  });

  it("keep proof of consent without personal data", async () => {
    const t = makeTest();
    const team = await seedTeam(t);
    const personId = await newPerson(team.rep, {
      firstName: "Priya",
      email: "priya@globex.com",
    });
    await team.rep.as.mutation(api.consents.record, {
      personId,
      channels: ["email"],
      event: "grant",
      purpose: "sales_outreach",
      basis: "consent",
      source: "call",
      note: "Priya said yes, priya@globex.com",
    });
    await team.admin.as.mutation(api.consents.erase, {
      personId,
      confirmation: "erase",
    });
    const rows = await t.run((ctx) =>
      ctx.db
        .query("consents")
        .withIndex("by_person", (q) => q.eq("personId", personId))
        .collect(),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toMatch(/priya/i);
    const person = await t.run((ctx) => ctx.db.get(personId));
    expect(person?.erasedAt).toBeTypeOf("number");
    expect(person?.email).toBeUndefined();
  });
});
