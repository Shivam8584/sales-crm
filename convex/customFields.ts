import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  CUSTOM_FIELD_ENTITIES,
  CUSTOM_FIELD_TYPES,
  MAX_CUSTOM_FIELDS,
  MAX_FIELD_OPTIONS,
  MAX_LABEL_LENGTH,
  MAX_OPTION_LENGTH,
  MAX_TEXT_LENGTH,
  fieldKey,
  type CustomFieldEntity,
  type CustomValue,
} from "../lib/domain/custom-fields";
import { cleanText, isValidDay } from "../lib/domain/normalize";
import { fail, invalid, notFound } from "./lib/errors";
import { adminMutation, memberMutation, memberQuery } from "./lib/functions";
import { assertCan } from "./lib/permissions";
import { requireAccount, requirePerson } from "./lib/records";
import { logChanges } from "./lib/timeline";
import { literals } from "./lib/validators";

const vEntity = literals(CUSTOM_FIELD_ENTITIES);
const vType = literals(CUSTOM_FIELD_TYPES);

function fieldsOf(ctx: QueryCtx, entity: CustomFieldEntity) {
  return ctx.db
    .query("customFields")
    .withIndex("by_entity", (q) => q.eq("entity", entity))
    .take(MAX_CUSTOM_FIELDS);
}

function toClient(field: Doc<"customFields">) {
  return {
    _id: field._id,
    key: field.key,
    label: field.label,
    type: field.type,
    options: field.options ?? [],
    order: field.order,
  };
}

function matches(field: Doc<"customFields">, value: unknown) {
  switch (field.type) {
    case "number":
      return typeof value === "number";
    case "checkbox":
      return typeof value === "boolean";
    default:
      return typeof value === "string";
  }
}

/** A record's stored values limited to defined fields of the right type, so removed definitions never leak. */
export async function visibleCustom(
  ctx: QueryCtx,
  entity: CustomFieldEntity,
  custom: Doc<"accounts">["custom"],
) {
  const out: Record<string, CustomValue> = {};
  if (!custom) return out;
  for (const field of await fieldsOf(ctx, entity)) {
    const value = custom[field.key];
    if (value !== undefined && matches(field, value)) out[field.key] = value;
  }
  return out;
}

export const list = memberQuery({
  args: { entity: vEntity },
  handler: async (ctx, { entity }) =>
    (await fieldsOf(ctx, entity)).map(toClient),
});

function cleanOptions(options: string[] | undefined) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of options ?? []) {
    const option = cleanText(raw);
    if (!option) continue;
    if (option.length > MAX_OPTION_LENGTH) {
      invalid("options", `Keep options under ${MAX_OPTION_LENGTH} characters`);
    }
    if (seen.has(option.toLowerCase())) continue;
    seen.add(option.toLowerCase());
    out.push(option);
  }
  if (out.length === 0) invalid("options", "Add at least one option");
  if (out.length > MAX_FIELD_OPTIONS) {
    invalid("options", `Use at most ${MAX_FIELD_OPTIONS} options`);
  }
  return out;
}

function cleanLabel(value: string) {
  const label = cleanText(value);
  if (!label) invalid("label", "Enter a name for the field");
  if (label.length > MAX_LABEL_LENGTH) invalid("label", "Name is too long");
  return label;
}

export const create = adminMutation({
  args: {
    entity: vEntity,
    label: v.string(),
    type: vType,
    options: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { entity, type, ...args }) => {
    const label = cleanLabel(args.label);
    const key = fieldKey(label);
    if (!key) invalid("label", "Use letters or numbers in the name");
    const existing = await fieldsOf(ctx, entity);
    if (existing.length >= MAX_CUSTOM_FIELDS) {
      fail("conflict", `Up to ${MAX_CUSTOM_FIELDS} custom fields per record`);
    }
    if (existing.some((field) => field.key === key)) {
      fail("conflict", `${label} is already a field`, "label");
    }
    return await ctx.db.insert("customFields", {
      entity,
      key,
      label,
      type,
      options: type === "select" ? cleanOptions(args.options) : undefined,
      order: Math.max(-1, ...existing.map((field) => field.order)) + 1,
    });
  },
});

/** The key and type are fixed: values already stored depend on them. */
export const update = adminMutation({
  args: {
    id: v.id("customFields"),
    label: v.optional(v.string()),
    options: v.optional(v.array(v.string())),
    order: v.optional(v.number()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const field = await ctx.db.get(id);
    if (!field) notFound("Field");
    if (patch.options !== undefined && field.type !== "select") {
      invalid("options", "Only select fields have options");
    }
    const next: Partial<Doc<"customFields">> = {};
    if (patch.label !== undefined) next.label = cleanLabel(patch.label);
    if (patch.options !== undefined) next.options = cleanOptions(patch.options);
    if (patch.order !== undefined) next.order = patch.order;
    await ctx.db.patch(id, next);
  },
});

/** Stored values stay on the records but are ignored once the definition is gone. */
export const remove = adminMutation({
  args: { id: v.id("customFields") },
  handler: async (ctx, { id }) => {
    if (!(await ctx.db.get(id))) notFound("Field");
    await ctx.db.delete(id);
  },
});

export const reorder = adminMutation({
  args: { entity: vEntity, ids: v.array(v.id("customFields")) },
  handler: async (ctx, { entity, ids }) => {
    const fields = await fieldsOf(ctx, entity);
    if (
      ids.length !== fields.length ||
      !fields.every((field) => ids.includes(field._id))
    ) {
      invalid("ids", "Reload and try again");
    }
    for (const [order, id] of ids.entries()) await ctx.db.patch(id, { order });
  },
});

function checked(field: Doc<"customFields">, value: unknown): CustomValue {
  const bad = () => invalid("value", `Enter a valid ${field.type} value`);
  switch (field.type) {
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) bad();
      return value as number;
    case "checkbox":
      if (typeof value !== "boolean") bad();
      return value as boolean;
    case "date":
      if (typeof value !== "string" || !isValidDay(value)) {
        invalid("value", "Pick a valid date");
      }
      return value as string;
    case "select":
      if (typeof value !== "string" || !field.options?.includes(value)) {
        invalid("value", "Pick one of the options");
      }
      return value as string;
    default: {
      if (typeof value !== "string") bad();
      const text = (value as string).trim();
      if (text.length > MAX_TEXT_LENGTH) {
        invalid("value", `Keep it under ${MAX_TEXT_LENGTH} characters`);
      }
      return text;
    }
  }
}

function shown(value: CustomValue | null | undefined) {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

const vTarget = v.union(
  v.object({ accountId: v.id("accounts") }),
  v.object({ personId: v.id("people") }),
  v.object({ dealId: v.id("deals") }),
);

async function resolve(ctx: MutationCtx, target: typeof vTarget.type) {
  if ("accountId" in target) {
    const doc = await requireAccount(ctx, target.accountId);
    return {
      entity: "account" as const,
      custom: doc.custom,
      owner: doc.ownerId,
      refs: { accountId: doc._id },
      write: (custom: Doc<"accounts">["custom"]) =>
        ctx.db.patch(doc._id, { custom, updatedAt: Date.now() }),
    };
  }
  if ("personId" in target) {
    const doc = await requirePerson(ctx, target.personId);
    if (doc.erasedAt) {
      fail("forbidden", "This person's data was erased and can't be edited");
    }
    return {
      entity: "person" as const,
      custom: doc.custom,
      owner: doc.ownerId,
      refs: { personId: doc._id, accountId: doc.accountId },
      write: (custom: Doc<"people">["custom"]) =>
        ctx.db.patch(doc._id, { custom, updatedAt: Date.now() }),
    };
  }
  const doc = await ctx.db.get(target.dealId);
  if (!doc) notFound("Deal");
  return {
    entity: "deal" as const,
    custom: doc.custom,
    owner: doc.ownerId,
    refs: { dealId: doc._id, accountId: doc.accountId },
    write: (custom: Doc<"deals">["custom"]) =>
      ctx.db.patch(doc._id, { custom, updatedAt: Date.now() }),
  };
}

/** `null` clears the value. Returns the previous one so the client can offer undo. */
export const setValue = memberMutation({
  args: {
    target: vTarget,
    key: v.string(),
    value: v.union(v.string(), v.number(), v.boolean(), v.null()),
  },
  handler: async (ctx, { target, key, value }) => {
    const record = await resolve(ctx, target);
    assertCan(ctx.viewer, "record.edit", [record.owner]);
    const field = await ctx.db
      .query("customFields")
      .withIndex("by_entity_key", (q) =>
        q.eq("entity", record.entity).eq("key", key),
      )
      .unique();
    if (!field) notFound("Field");

    const previous = record.custom?.[key];
    const next = value === null ? null : checked(field, value);
    const clear = next === null || next === "";
    if (clear ? previous === undefined : previous === next) {
      return previous ?? null;
    }

    const custom = { ...record.custom };
    if (clear) delete custom[key];
    else custom[key] = next;
    await record.write(Object.keys(custom).length ? custom : undefined);
    await logChanges(ctx, record.refs, ctx.viewer._id, [
      { field: field.label, from: shown(previous), to: shown(next) },
    ]);
    return previous ?? null;
  },
});
