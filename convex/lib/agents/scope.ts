import type { Doc } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { fail } from "../errors";

type Input = Record<string, unknown>;

const text = (value: unknown) => (typeof value === "string" ? value : null);

/** The record ids a tool call names, by table, wherever the tool takes them. */
function named(tool: string, input: Input) {
  const target = input.target as { type?: string; id?: string } | undefined;
  const ids: {
    table: "accounts" | "people" | "leads" | "deals" | "tasks";
    id: string | null;
  }[] = [];
  switch (tool) {
    case "get_account":
      ids.push({ table: "accounts", id: text(input.id) });
      break;
    case "get_person":
      ids.push({ table: "people", id: text(input.id) });
      break;
    case "get_lead":
      ids.push({ table: "leads", id: text(input.id) });
      break;
    case "get_deal":
    case "update_deal_stage":
      ids.push({ table: "deals", id: text(input.id) });
      break;
    case "complete_task":
      ids.push({ table: "tasks", id: text(input.id) });
      break;
    case "create_task":
      ids.push(
        { table: "accounts", id: text(input.accountId) },
        { table: "people", id: text(input.personId) },
        { table: "leads", id: text(input.leadId) },
        { table: "deals", id: text(input.dealId) },
      );
      break;
    case "create_note":
    case "log_call":
    case "add_tag": {
      const table = (
        {
          account: "accounts",
          person: "people",
          lead: "leads",
          deal: "deals",
        } as const
      )[target?.type as "account"];
      if (table) ids.push({ table, id: text(target?.id) });
    }
  }
  return ids.filter((item) => item.id);
}

/**
 * An agent with own scope may only open or change records its owner owns or is
 * assigned. Records the owner can see but doesn't own are refused, so a
 * manager's "my deals" agent can't wander into the rest of the team's.
 */
export async function assertInScope(
  ctx: QueryCtx,
  member: Doc<"members">,
  scope: "own" | "team",
  tool: string,
  input: Input,
) {
  if (scope === "team") {
    if (member.role !== "admin")
      fail("forbidden", "Team scope needs an admin owner");
    return;
  }
  for (const { table, id } of named(tool, input)) {
    const key = ctx.db.normalizeId(table, id!);
    const row = key ? await ctx.db.get(key) : null;
    if (!row) continue;
    const owner =
      "assigneeId" in row
        ? row.assigneeId
        : (row as { ownerId?: string }).ownerId;
    if (owner !== member._id) {
      fail(
        "forbidden",
        "That record isn't yours. This agent only works on your own records.",
      );
    }
  }
}
