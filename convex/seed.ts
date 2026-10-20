import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type {
  DealStage,
  LeadStatus,
  LifecycleStage,
  Priority,
} from "../lib/domain/enums";
import { money } from "../lib/domain/money";
import { fail } from "./lib/errors";
import { createLead } from "./lib/leads";

const DEALS: {
  account: string;
  title: string;
  stage: DealStage;
  rupees: number;
  closeInDays: number;
}[] = [
  {
    account: "Baybee",
    title: "Festive slots expansion",
    stage: "won",
    rupees: 180000,
    closeInDays: -6,
  },
  {
    account: "Dailora",
    title: "Kitchen range launch, 3 SKUs",
    stage: "onboarding",
    rupees: 95000,
    closeInDays: 10,
  },
  {
    account: "Drogo",
    title: "Earbuds review push",
    stage: "proposal",
    rupees: 120000,
    closeInDays: 14,
  },
  {
    account: "Kesar Leaf Naturals",
    title: "Nykaa launch pilot",
    stage: "demo",
    rupees: 60000,
    closeInDays: 21,
  },
  {
    account: "Urban Tadka",
    title: "Quick commerce pilot",
    stage: "proposal",
    rupees: 45000,
    closeInDays: 7,
  },
  {
    account: "Thread Theory",
    title: "Myntra winter drop",
    stage: "discovery",
    rupees: 75000,
    closeInDays: 30,
  },
  {
    account: "Pawsome Pets",
    title: "Amazon starter pack",
    stage: "discovery",
    rupees: 30000,
    closeInDays: 35,
  },
  {
    account: "Glow Theory",
    title: "Serum relaunch",
    stage: "lost",
    rupees: 50000,
    closeInDays: -12,
  },
];

const TASKS: {
  account: string;
  title: string;
  priority: Priority;
  dueInDays: number;
}[] = [
  {
    account: "Urban Tadka",
    title: "Share UPI top-up link and ROI recap",
    priority: "urgent",
    dueInDays: -1,
  },
  {
    account: "Drogo",
    title: "Send revised proposal with bundled price",
    priority: "high",
    dueInDays: 0,
  },
  {
    account: "Kesar Leaf Naturals",
    title: "Prepare demo around their Nykaa listings",
    priority: "high",
    dueInDays: 1,
  },
  {
    account: "Mitti Craft",
    title: "Help finish GST verification",
    priority: "normal",
    dueInDays: 2,
  },
  {
    account: "Glow Theory",
    title: "Win-back call: ask what changed",
    priority: "normal",
    dueInDays: 4,
  },
  {
    account: "Thread Theory",
    title: "Book discovery call with e-commerce head",
    priority: "low",
    dueInDays: 6,
  },
];

const LEADS: {
  name: string;
  email: string;
  phone?: string;
  companyName: string;
  website?: string;
  utmSource?: string;
  utmMedium?: string;
  status: LeadStatus;
  message?: string;
}[] = [
  {
    name: "Aditi Verma",
    email: "aditi@snackwala.in",
    phone: "+919811122233",
    companyName: "Snackwala",
    website: "snackwala.in",
    utmSource: "google",
    utmMedium: "cpc",
    status: "new",
    message: "Launching 4 new SKUs on Amazon next month.",
  },
  {
    name: "Rahul Jain",
    email: "rahul@ayurvedaco.in",
    companyName: "Ayurveda Co",
    website: "ayurvedaco.in",
    utmSource: "linkedin",
    utmMedium: "social",
    status: "contacted",
  },
  {
    name: "Sneha Pillai",
    email: "sneha@lumebags.in",
    phone: "+919820045678",
    companyName: "Lume Bags",
    utmSource: "website",
    utmMedium: "cta",
    status: "qualified",
    message: "Want reviews on our new Myntra listings.",
  },
  {
    name: "Imran Sheikh",
    email: "imran@brewhaus.in",
    companyName: "Brewhaus",
    utmSource: "google",
    utmMedium: "cpc",
    status: "nurture",
  },
  {
    name: "Kavya Reddy",
    email: "kavya@petals.in",
    companyName: "Petals Skincare",
    utmSource: "instagram",
    utmMedium: "social",
    status: "new",
  },
];

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
    const accounts = await ctx.db.query("accounts").collect();
    const byName = new Map(accounts.map((account) => [account.name, account]));
    const dayKey = (days: number) =>
      new Date(now + days * day).toISOString().slice(0, 10);

    const positions = new Map<string, number>();
    for (const deal of DEALS) {
      const account = byName.get(deal.account)!;
      const position = (positions.get(deal.stage) ?? 0) + 1;
      positions.set(deal.stage, position);
      const closed = deal.stage === "won" || deal.stage === "lost";
      await ctx.db.insert("deals", {
        accountId: account._id,
        title: deal.title,
        stage: deal.stage,
        amount: money(deal.rupees),
        ownerId: account.ownerId,
        closeDate: dayKey(deal.closeInDays),
        personIds: [],
        position,
        lostReason: deal.stage === "lost" ? "Chose an agency" : undefined,
        closedAt: closed ? now + deal.closeInDays * day : undefined,
        updatedAt: now,
      });
    }

    for (const [index, task] of TASKS.entries()) {
      const account = byName.get(task.account)!;
      await ctx.db.insert("tasks", {
        title: task.title,
        status: index === 1 ? "in_progress" : "todo",
        priority: task.priority,
        assigneeId: account.ownerId,
        dueDate: dayKey(task.dueInDays),
        accountId: account._id,
        position: index + 1,
        updatedAt: now,
      });
    }

    for (const lead of LEADS) {
      const { id } = await createLead(
        ctx,
        {
          kind: "demo",
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          companyName: lead.companyName,
          website: lead.website,
          message: lead.message,
          source: "demo_form",
          utm: {
            source: lead.utmSource,
            medium: lead.utmMedium,
            campaign: "talk_to_sales",
          },
          landingPage: "/demo",
          firstTouchedAt: lead.status === "new" ? undefined : now,
        },
        { announce: lead.status === "new" ? "lead_new" : false },
      );
      if (lead.status !== "new")
        await ctx.db.patch(id, { status: lead.status });
    }

    return {
      accounts: ACCOUNTS.length,
      deals: DEALS.length,
      tasks: TASKS.length,
      leads: LEADS.length,
    };
  },
});
