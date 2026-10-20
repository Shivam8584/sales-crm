import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { cleanText } from "../../lib/domain/normalize";
import { invalid, notFound } from "./errors";

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

const MAX_ACCOUNT_NAME = 120;

/** The one rule for account names, shared by edits and accepted suggestions. */
export function accountName(value: string | null | undefined) {
  const name = cleanText(value);
  if (!name) invalid("name", "Enter the account name");
  if (name.length > MAX_ACCOUNT_NAME) invalid("name", "Name is too long");
  return name;
}
