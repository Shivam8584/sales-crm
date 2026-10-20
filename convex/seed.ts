import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { LifecycleStage } from "../lib/domain/enums";
import { fail } from "./lib/errors";

const ACCOUNTS: {
  name: string;
  domain: string;
  stage: LifecycleStage;
  tags: string[];
  people: [string, string, string][];
}[] = [
  {
    name: "Baybee",
    domain: "baybee.co.in",
    stage: "activated",
    tags: ["Baby care", "Amazon"],
    people: [
      ["Rohit", "Agarwal", "Founder"],
      ["Neha", "Kapoor", "Marketplace Manager"],
    ],
  },
  {
    name: "Dailora",
    domain: "dailora.in",
    stage: "live",
    tags: ["Home & kitchen", "Amazon"],
    people: [["Arjun", "Mehta", "Co-founder"]],
  },
  {
    name: "Drogo",
    domain: "drogo.in",
    stage: "funded",
    tags: ["Electronics", "Flipkart"],
    people: [["Sana", "Qureshi", "Head of Growth"]],
  },
  {
    name: "Kesar Leaf Naturals",
    domain: "kesarleaf.in",
    stage: "demo",
    tags: ["Beauty", "Nykaa"],
    people: [
      ["Priya", "Iyer", "Founder"],
      ["Karan", "Malhotra", "Performance Marketing Lead"],
    ],
  },
  {
    name: "Urban Tadka",
    domain: "urbantadka.in",
    stage: "gst_verified",
    tags: ["Food", "Quick commerce"],
    people: [["Vikram", "Singh", "Founder"]],
  },
  {
    name: "Mitti Craft",
    domain: "mitticraft.in",
    stage: "org_created",
    tags: ["Home decor", "Myntra"],
    people: [["Ananya", "Rao", "Brand Manager"]],
  },
  {
    name: "Thread Theory",
    domain: "threadtheory.in",
    stage: "qualified",
    tags: ["Apparel", "Myntra"],
    people: [["Ishaan", "Bose", "E-commerce Head"]],
  },
  {
    name: "Pawsome Pets",
    domain: "pawsomepets.in",
    stage: "lead",
    tags: ["Pet care", "Amazon"],
    people: [["Meera", "Nair", "Founder"]],
  },
  {
    name: "Brew Bros Coffee",
    domain: "brewbros.in",
    stage: "prospect",
    tags: ["Beverages", "Shopify"],
    people: [],
  },
  {
    name: "Glow Theory",
    domain: "glowtheory.in",
    stage: "at_risk",
    tags: ["Beauty", "Amazon"],
    people: [["Tanvi", "Shah", "Growth Lead"]],
  },
];

/**
 * Demo workspace data for local development. Run once after the first admin
 * has signed in: `npx convex run seed:demo`.
 */
export const demo = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (await ctx.db.query("accounts").first()) {
      fail("conflict", "The workspace already has accounts; seed skipped");
    }
    const members = await ctx.db.query("members").collect();
    if (members.length === 0) {
      fail("invalid", "Sign in once before seeding so there is an owner");
    }

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    for (const [index, item] of ACCOUNTS.entries()) {
      const owner = members[index % members.length];
      const lastActivityAt = now - (index * 2 + 1) * day;
      const accountId: Id<"accounts"> = await ctx.db.insert("accounts", {
        name: item.name,
        domain: item.domain,
        ownerId: owner._id,
        stage: item.stage,
        tags: item.tags,
        lastActivityAt,
        updatedAt: now,
      });
      for (const [firstName, lastName, title] of item.people) {
        const email = `${firstName.toLowerCase()}@${item.domain}`;
        await ctx.db.insert("people", {
          accountId,
          firstName,
          lastName,
          email,
          title,
          ownerId: owner._id,
          tags: [],
          lastActivityAt,
          updatedAt: now,
          searchText: `${firstName} ${lastName} ${email} ${title} ${item.name}`,
        });
      }
      await ctx.db.insert("timeline", {
        kind: "note",
        accountId,
        actorId: owner._id,
        occurredAt: lastActivityAt,
        body: `Intro call booked with ${item.name}.`,
      });
    }
    return ACCOUNTS.length;
  },
});
