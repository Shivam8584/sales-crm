import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { cleanText } from "../../lib/domain/normalize";
import { ConvexError } from "convex/values";
import { invalid, notFound, type AppErrorData } from "./errors";

export type MemberRef = { _id: Id<"members">; name: string };

/** All members by id, for resolving owner names in list queries. */
export async function memberIndex(ctx: QueryCtx) {
  const members = await ctx.db.query("members").collect();
  return new Map(members.map((member) => [member._id, member]));
}

export function memberRef(
  index: Map<Id<"members">, Doc<"members">>,
  id: Id<"members"> | undefined,
): MemberRef | null {
  const member = id ? index.get(id) : undefined;
  return member ? { _id: member._id, name: member.name } : null;
}

export async function requireActiveMember(
  ctx: QueryCtx,
  id: Id<"members">,
  field: string,
) {
  const member = await ctx.db.get(id);
  if (!member || member.status !== "active") {
    invalid(field, "Pick an active teammate");
  }
  return member;
}

export async function requireAccount(ctx: QueryCtx, id: Id<"accounts">) {
  const account = await ctx.db.get(id);
  if (!account) notFound("Account");
  return account;
}

export async function requirePerson(ctx: QueryCtx, id: Id<"people">) {
  const person = await ctx.db.get(id);
  if (!person) notFound("Person");
  return person;
}

export function personSearchText(
  person: Pick<
    Doc<"people">,
    "firstName" | "lastName" | "email" | "phone" | "title"
  >,
  accountName?: string,
) {
  return [
    person.firstName,
    person.lastName,
    person.email,
    person.phone,
    person.title,
    accountName,
  ]
    .filter(Boolean)
    .join(" ");
}

export const MAX_IMPORT_ROWS = 1000;

export type ImportResult =
  | { row: number; status: "created"; id: string }
  | { row: number; status: "ready" }
  | { row: number; status: "duplicate"; message: string }
  | { row: number; status: "error"; message: string; field?: string };

/**
 * Turns a validation error thrown by a record's `clean` into a per-row result,
 * so one bad row doesn't abort the whole import.
 */
export function importFailure(row: number, error: unknown): ImportResult {
  if (error instanceof ConvexError) {
    const data = error.data as AppErrorData;
    if (data.code === "conflict") {
      return { row, status: "duplicate", message: data.message };
    }
    if (data.code === "invalid" || data.code === "not_found") {
      return { row, status: "error", message: data.message, field: data.field };
    }
  }
  throw error;
}

/** An active teammate by email or full name, as typed in an imported file. */
export function findMember(members: Doc<"members">[], value: string) {
  const text = value.trim().toLowerCase();
  const member = members.find(
    (item) =>
      item.status === "active" &&
      (item.email.toLowerCase() === text || item.name.toLowerCase() === text),
  );
  if (!member) invalid("owner", `No active teammate matches “${value.trim()}”`);
  return member;
}

export function checkImportSize(count: number) {
  if (count === 0) invalid("rows", "The file has no rows to import");
  if (count > MAX_IMPORT_ROWS) {
    invalid("rows", `Import up to ${MAX_IMPORT_ROWS} rows at a time`);
  }
}

const MAX_ACCOUNT_NAME = 120;

/** The one rule for account names, shared by edits and accepted suggestions. */
export function accountName(value: string | null | undefined) {
  const name = cleanText(value);
  if (!name) invalid("name", "Enter the account name");
  if (name.length > MAX_ACCOUNT_NAME) invalid("name", "Name is too long");
  return name;
}
