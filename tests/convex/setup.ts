/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import aggregate from "@convex-dev/aggregate/test";
import migrations from "@convex-dev/migrations/test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { DEFAULT_SETTINGS } from "../../lib/domain/automations";
import type { Role } from "../../lib/domain/enums";

const modules = import.meta.glob("../../convex/**/*.*s");

export function makeTest() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  migrations.register(t);
  for (const name of ["accountCounts", "peopleCounts", "leadCounts"]) {
    aggregate.register(t, name);
  }
  return t;
}

export type T = ReturnType<typeof makeTest>;

export type Actor = {
  id: Id<"members">;
  userId: Id<"users">;
  role: Role;
  as: ReturnType<T["withIdentity"]>;
};

let joined = 0;

export async function seedMember(
  t: T,
  role: Role,
  name = `${role} ${joined}`,
): Promise<Actor> {
  const email = `${name.toLowerCase().replace(/\W+/g, ".")}@example.com`;
  const { id, userId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name, email });
    const id = await ctx.db.insert("members", {
      userId,
      name,
      email,
      role,
      status: "active",
      joinedAt: Date.now() + joined++,
    });
    return { id, userId };
  });
  return {
    id,
    userId,
    role,
    as: t.withIdentity({ subject: `${userId}|session` }),
  };
}

/** Admin, manager and two reps: the cast most permission tests need. */
export async function seedTeam(t: T) {
  const [admin, manager, rep, otherRep] = await Promise.all([
    seedMember(t, "admin", "Ada Admin"),
    seedMember(t, "manager", "Max Manager"),
    seedMember(t, "rep", "Ria Rep"),
    seedMember(t, "rep", "Omar Other"),
  ]);
  return { admin, manager, rep, otherRep };
}

export const newAccount = (
  by: Actor,
  name = "Acme Traders",
  ownerId: Id<"members"> = by.id,
  domain?: string,
) => by.as.mutation(api.accounts.create, { name, ownerId, domain });

export const newPerson = (
  by: Actor,
  fields: {
    firstName: string;
    lastName?: string;
    email?: string;
    phone?: string;
    accountId?: Id<"accounts">;
    ownerId?: Id<"members">;
  },
) => by.as.mutation(api.people.create, { ownerId: by.id, ...fields });

/** The `ConvexError` code a call fails with, or null when it succeeds. */
export async function failureCode(call: Promise<unknown>) {
  try {
    await call;
    return null;
  } catch (error) {
    const data = (error as { data?: { code?: string } }).data;
    if (data?.code) return data.code;
    throw error;
  }
}

export function seedSequence(
  t: T,
  createdBy: Actor,
  options: {
    active?: boolean;
    trigger?: Doc<"automations">["trigger"];
    subjectKind?: Doc<"automations">["subjectKind"];
  } = {},
) {
  const trigger = options.trigger ?? { kind: "manual" as const };
  const subjectKind = options.subjectKind ?? "person";
  const graph = {
    nodes: [
      { id: "trigger", kind: "trigger" as const, x: 0, y: 0, config: {} },
      {
        id: "task",
        kind: "create_task" as const,
        x: 0,
        y: 190,
        config: {
          title: "Call them",
          assignee: "owner",
          dueInDays: 1,
          priority: "normal",
        },
      },
    ],
    edges: [
      { id: "e1", source: "trigger", port: "out" as const, target: "task" },
    ],
  };
  return t.run(async (ctx) =>
    ctx.db.insert("automations", {
      name: "Follow-up",
      description: "",
      status: options.active ? "active" : "draft",
      subjectKind,
      trigger,
      graph,
      settings: DEFAULT_SETTINGS,
      version: options.active ? 1 : 0,
      published: options.active
        ? {
            version: 1,
            subjectKind,
            trigger,
            graph,
            settings: DEFAULT_SETTINGS,
            publishedAt: Date.now(),
            publishedById: createdBy.id,
          }
        : undefined,
      stats: { enrolled: 0, active: 0, completed: 0, exited: 0, failed: 0 },
      createdById: createdBy.id,
      updatedAt: Date.now(),
    }),
  );
}
