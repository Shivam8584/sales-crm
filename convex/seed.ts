import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type {
  CallOutcome,
  DealStage,
  DisqualifyReason,
  LeadKind,
  LeadStatus,
  LifecycleStage,
  Priority,
  TaskStatus,
} from "../lib/domain/enums";
import { money } from "../lib/domain/money";
import type { ActivationStage } from "../lib/domain/platform";
import type { ProposalLine } from "../lib/domain/pricing";
import { syncAccountActivation } from "./lib/activation";
import { appendLedger } from "./lib/consent";
import { fail } from "./lib/errors";
import { createLead, recordConsents } from "./lib/leads";
import { personSearchText } from "./lib/records";
import { notify } from "./notifications";
import { receive } from "./lib/platform";
import { simulateAccount, type Scenario } from "./platform";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

type Person = {
  first: string;
  last: string;
  title: string;
  phone?: string;
  /** Consent recorded on a call: email and WhatsApp for sales outreach. */
  consent?: "granted" | "withdrawn" | "updates_only" | "dnd";
};

type AccountSeed = {
  name: string;
  domain: string;
  stage: LifecycleStage;
  tags: string[];
  gstin?: string;
  /** Owner by index into the active members. */
  owner: number;
  people: Person[];
  /** Walks the brand along the platform path to this stage. */
  platform?: ActivationStage;
  /** Then stages a v2 stall or expansion signal. */
  scenario?: Scenario;
};

const ACCOUNTS: AccountSeed[] = [
  {
    name: "Baybee",
    domain: "baybee.co.in",
    stage: "expanding",
    tags: ["Baby care", "Amazon"],
    owner: 0,
    platform: "activated",
    scenario: "expansion",
    people: [
      {
        first: "Rohit",
        last: "Agarwal",
        title: "Founder",
        phone: "+919810011122",
        consent: "granted",
      },
      { first: "Neha", last: "Kapoor", title: "Marketplace manager" },
    ],
  },
  {
    name: "Dailora",
    domain: "dailora.in",
    stage: "demo",
    tags: ["Home & kitchen", "Amazon"],
    owner: 1,
    platform: "live",
    scenario: "review_backlog",
    people: [
      {
        first: "Arjun",
        last: "Mehta",
        title: "Co-founder",
        phone: "+919820022233",
        consent: "granted",
      },
    ],
  },
  {
    name: "Drogo",
    domain: "drogo.in",
    stage: "demo",
    tags: ["Electronics", "Flipkart"],
    owner: 0,
    platform: "live",
    scenario: "paused_no_funds",
    people: [
      {
        first: "Sana",
        last: "Qureshi",
        title: "Head of growth",
        phone: "+919830033344",
        consent: "dnd",
      },
    ],
  },
  {
    name: "Urban Tadka",
    domain: "urbantadka.in",
    stage: "demo",
    tags: ["Food", "Quick commerce"],
    owner: 1,
    platform: "org_created",
    people: [
      {
        first: "Vikram",
        last: "Singh",
        title: "Founder",
        phone: "+919840044455",
        consent: "granted",
      },
    ],
  },
  {
    name: "Mitti Craft",
    domain: "mitticraft.in",
    stage: "demo",
    tags: ["Home decor", "Myntra"],
    owner: 1,
    platform: "funded",
    scenario: "changes_requested",
    people: [{ first: "Ananya", last: "Rao", title: "Brand manager" }],
  },
  {
    name: "Snackwala",
    domain: "snackwala.in",
    stage: "demo",
    tags: ["Food", "Amazon"],
    owner: 0,
    platform: "signed_up",
    scenario: "gst_failed",
    people: [
      {
        first: "Aditi",
        last: "Verma",
        title: "Founder",
        phone: "+919811122233",
        consent: "updates_only",
      },
    ],
  },
  {
    name: "Kesar Leaf Naturals",
    domain: "kesarleaf.in",
    stage: "demo",
    tags: ["Beauty", "Nykaa"],
    owner: 1,
    people: [
      {
        first: "Priya",
        last: "Iyer",
        title: "Founder",
        phone: "+919850055566",
        consent: "granted",
      },
      { first: "Karan", last: "Malhotra", title: "Performance marketing lead" },
    ],
  },
  {
    name: "Thread Theory",
    domain: "threadtheory.in",
    stage: "qualified",
    tags: ["Apparel", "Myntra"],
    owner: 1,
    people: [{ first: "Ishaan", last: "Bose", title: "E-commerce head" }],
  },
  {
    name: "Pawsome Pets",
    domain: "pawsomepets.in",
    stage: "lead",
    tags: ["Pet care", "Amazon"],
    owner: 0,
    people: [{ first: "Meera", last: "Nair", title: "Founder" }],
  },
  {
    name: "Brew Bros Coffee",
    domain: "brewbros.in",
    stage: "prospect",
    tags: ["Beverages", "Shopify"],
    owner: 1,
    people: [],
  },
  {
    name: "Glow Theory",
    domain: "glowtheory.in",
    stage: "at_risk",
    tags: ["Beauty", "Amazon"],
    owner: 0,
    platform: "activated",
    scenario: "renewal",
    people: [
      {
        first: "Tanvi",
        last: "Shah",
        title: "Growth lead",
        phone: "+919860066677",
        consent: "withdrawn",
      },
    ],
  },
  {
    name: "Loom & Weft",
    domain: "loomweft.in",
    stage: "dormant",
    tags: ["Apparel", "Ajio"],
    owner: 1,
    platform: "live",
    scenario: "low_balance",
    people: [{ first: "Farah", last: "Khan", title: "Owner" }],
  },
  {
    name: "Quick Fix Gadgets",
    domain: "quickfixgadgets.in",
    stage: "disqualified",
    tags: ["Electronics"],
    owner: 0,
    people: [],
  },
];

type DealSeed = {
  account: string;
  title: string;
  stage: DealStage;
  rupees: number;
  closeInDays: number;
  contacts: number;
  lostReason?: string;
};

const DEALS: DealSeed[] = [
  {
    account: "Baybee",
    title: "Festive slots expansion",
    stage: "won",
    rupees: 180000,
    closeInDays: -6,
    contacts: 1,
  },
  {
    account: "Baybee",
    title: "Diaper range reviews, Q1",
    stage: "discovery",
    rupees: 120000,
    closeInDays: 40,
    contacts: 2,
  },
  {
    account: "Dailora",
    title: "Kitchen range launch, 3 SKUs",
    stage: "onboarding",
    rupees: 95000,
    closeInDays: 10,
    contacts: 1,
  },
  {
    account: "Drogo",
    title: "Earbuds review push",
    stage: "proposal",
    rupees: 120000,
    closeInDays: 14,
    contacts: 1,
  },
  {
    account: "Kesar Leaf Naturals",
    title: "Nykaa launch pilot",
    stage: "proposal",
    rupees: 60000,
    closeInDays: 21,
    contacts: 2,
  },
  {
    account: "Urban Tadka",
    title: "Quick commerce pilot",
    stage: "demo",
    rupees: 45000,
    closeInDays: 7,
    contacts: 1,
  },
  {
    account: "Thread Theory",
    title: "Myntra winter drop",
    stage: "discovery",
    rupees: 75000,
    closeInDays: 30,
    contacts: 1,
  },
  {
    account: "Pawsome Pets",
    title: "Amazon starter pack",
    stage: "discovery",
    rupees: 30000,
    closeInDays: 35,
    contacts: 0,
  },
  {
    account: "Glow Theory",
    title: "Serum relaunch",
    stage: "lost",
    rupees: 50000,
    closeInDays: -12,
    contacts: 1,
    lostReason: "Chose an agency",
  },
];

const TASKS: {
  account: string;
  title: string;
  priority: Priority;
  dueInDays: number;
  status: TaskStatus;
  /** Assignee by index into the active members. */
  assignee: number;
}[] = [
  {
    account: "Urban Tadka",
    title: "Share UPI top-up link and ROI recap",
    priority: "urgent",
    dueInDays: -1,
    status: "todo",
    assignee: 1,
  },
  {
    account: "Drogo",
    title: "Send revised proposal with bundled price",
    priority: "high",
    dueInDays: 0,
    status: "in_progress",
    assignee: 0,
  },
  {
    account: "Kesar Leaf Naturals",
    title: "Prepare demo around their Nykaa listings",
    priority: "high",
    dueInDays: 1,
    status: "todo",
    assignee: 0,
  },
  {
    account: "Glow Theory",
    title: "Win-back call: ask what changed",
    priority: "normal",
    dueInDays: 4,
    status: "todo",
    assignee: 0,
  },
  {
    account: "Thread Theory",
    title: "Book discovery call with e-commerce head",
    priority: "low",
    dueInDays: 6,
    status: "todo",
    assignee: 1,
  },
  {
    account: "Baybee",
    title: "Send festive results deck",
    priority: "normal",
    dueInDays: -3,
    status: "done",
    assignee: 0,
  },
  {
    account: "Dailora",
    title: "Confirm SKU list for onboarding",
    priority: "high",
    dueInDays: -2,
    status: "done",
    assignee: 1,
  },
];

type LeadSeed = {
  kind: LeadKind;
  name: string;
  email: string;
  phone?: string;
  companyName: string;
  website?: string;
  utm: { source?: string; medium?: string; campaign?: string };
  status: LeadStatus;
  message?: string;
  disqualifyReason?: DisqualifyReason;
  /** Converted into this seeded account. */
  account?: string;
  demoInDays?: number;
  owner?: number;
};

const LEADS: LeadSeed[] = [
  {
    kind: "demo",
    name: "Kavya Reddy",
    email: "kavya@petals.in",
    phone: "+919870077788",
    companyName: "Petals Skincare",
    website: "petals.in",
    utm: { source: "instagram", medium: "social", campaign: "talk_to_sales" },
    status: "new",
    message: "Launching 4 new SKUs on Amazon next month.",
  },
  {
    kind: "contact",
    name: "Dev Malhotra",
    email: "dev@greenroots.in",
    companyName: "Green Roots",
    utm: { source: "google", medium: "cpc", campaign: "brand-search" },
    status: "new",
  },
  {
    kind: "demo",
    name: "Rahul Jain",
    email: "rahul@ayurvedaco.in",
    phone: "+919880088899",
    companyName: "Ayurveda Co",
    website: "ayurvedaco.in",
    utm: { source: "linkedin", medium: "social", campaign: "talk_to_sales" },
    status: "contacted",
    demoInDays: 2,
    owner: 1,
  },
  {
    kind: "demo",
    name: "Sneha Pillai",
    email: "sneha@lumebags.in",
    phone: "+919820045678",
    companyName: "Lume Bags",
    utm: { source: "website", medium: "cta" },
    status: "qualified",
    message: "Want reviews on our new Myntra listings.",
    owner: 0,
  },
  {
    kind: "contact",
    name: "Imran Sheikh",
    email: "imran@brewhaus.in",
    companyName: "Brewhaus",
    utm: { source: "google", medium: "cpc" },
    status: "nurture",
    owner: 1,
  },
  {
    kind: "manual",
    name: "Nikhil Rao",
    email: "nikhil@cheapdeals.biz",
    companyName: "Cheap Deals",
    utm: {},
    status: "disqualified",
    disqualifyReason: "no_gst",
    owner: 0,
  },
  {
    kind: "demo",
    name: "Ishaan Bose",
    email: "ishaan@threadtheory.in",
    companyName: "Thread Theory",
    website: "threadtheory.in",
    utm: { source: "google", medium: "cpc", campaign: "talk_to_sales" },
    status: "converted",
    account: "Thread Theory",
    owner: 1,
  },
];

const NOTES: [string, string, CallOutcome?][] = [
  ["note", "Intro call booked. They sell mostly on Amazon."],
  ["call", "Walked through review campaigns; wants pricing.", "connected"],
  ["email", "Sent the case study deck and pricing sheet."],
  ["meeting", "Demo with founder and marketing lead."],
  ["whatsapp", "Shared onboarding checklist on WhatsApp."],
  ["call", "No answer; will try after lunch.", "no_answer"],
];

/** App data, wiped by `reset`. Members, invites, settings and auth stay. */
const APP_TABLES = [
  "accounts",
  "people",
  "leads",
  "consents",
  "deals",
  "proposals",
  "tasks",
  "timeline",
  "notifications",
  "facts",
  "enrichmentRuns",
  "platformEvents",
  "platformSnapshots",
  "retentionReviews",
  "rateLimits",
] as const;

function line(
  key: string,
  product: string,
  rupees: number,
  slots: number,
  price?: number,
): ProposalLine {
  return {
    key,
    product,
    marketplace: "amazon",
    archetype: "online_purchase",
    order: { value: money(rupees), fundBps: 6_000, feeBps: 1_000 },
    bonus: money(Math.round(rupees * 0.1)),
    bonusFeeBps: 3_000,
    coupon: { kind: "none" },
    slots,
    slotMode: "lines",
    expiryDays: 45,
    oversubscribe: 150,
    ...(price ? { price: money(price) } : {}),
    presentation: "bundled",
  };
}

async function seedWorkspace(ctx: MutationCtx) {
  const members = (
    await ctx.db
      .query("members")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect()
  ).sort((a, b) => a.joinedAt - b.joinedAt);
  if (members.length === 0) {
    fail("invalid", "Sign in once before seeding so there is an owner");
  }
  const member = (index: number) => members[index % members.length];
  const admin = members.find((item) => item.role === "admin") ?? members[0];
  const now = Date.now();
  const dayKey = (days: number) =>
    new Date(now + days * DAY).toISOString().slice(0, 10);

  const accounts = new Map<string, Doc<"accounts">>();
  const people = new Map<string, Doc<"people">[]>();
  for (const [index, item] of ACCOUNTS.entries()) {
    const owner = member(item.owner);
    const accountId = await ctx.db.insert("accounts", {
      name: item.name,
      domain: item.domain,
      ownerId: owner._id,
      stage: item.stage,
      tags: item.tags,
      lastActivityAt: now - (index + 1) * DAY,
      updatedAt: now,
    });
    await ctx.db.insert("timeline", {
      kind: "system",
      accountId,
      actorId: owner._id,
      occurredAt: now - (20 + index) * DAY,
      subject: "created the account",
    });
    const staff: Doc<"people">[] = [];
    for (const person of item.people) {
      const email = `${person.first.toLowerCase()}@${item.domain}`;
      const fields = {
        firstName: person.first,
        lastName: person.last,
        email,
        phone: person.phone,
        title: person.title,
      };
      const personId = await ctx.db.insert("people", {
        ...fields,
        accountId,
        ownerId: owner._id,
        tags: [],
        lastActivityAt: now - (index + 1) * DAY,
        updatedAt: now,
        searchText: personSearchText(fields, item.name),
      });
      await recordPersonConsent(ctx, personId, person.consent, owner._id);
      staff.push((await ctx.db.get(personId))!);
    }
    accounts.set(item.name, (await ctx.db.get(accountId))!);
    people.set(item.name, staff);
  }

  for (const [index, item] of ACCOUNTS.entries()) {
    const account = accounts.get(item.name)!;
    const contact = people.get(item.name)?.[0];
    for (let step = 0; step < 4; step++) {
      const [kind, body, outcome] = NOTES[(index + step) % NOTES.length];
      const occurredAt = now - ((index % 5) + step * 3) * DAY - step * HOUR;
      await ctx.db.insert("timeline", {
        kind: kind as Doc<"timeline">["kind"],
        accountId: account._id,
        personId: step % 2 === 0 ? contact?._id : undefined,
        actorId: account.ownerId,
        occurredAt,
        body,
        outcome,
        durationMin: kind === "call" ? 12 : undefined,
      });
    }
    if (item.platform) {
      await simulateAccount(ctx, account, item.platform, item.scenario);
      await syncAccountActivation(ctx, account._id, now);
    }
  }

  const positions = new Map<DealStage, number>();
  const dealIds = new Map<string, Id<"deals">>();
  for (const deal of DEALS) {
    const account = accounts.get(deal.account)!;
    const position = (positions.get(deal.stage) ?? 0) + 1;
    positions.set(deal.stage, position);
    const closed = deal.stage === "won" || deal.stage === "lost";
    const id = await ctx.db.insert("deals", {
      accountId: account._id,
      title: deal.title,
      stage: deal.stage,
      amount: money(deal.rupees),
      ownerId: account.ownerId,
      closeDate: dayKey(deal.closeInDays),
      personIds: (people.get(deal.account) ?? [])
        .slice(0, deal.contacts)
        .map((person) => person._id),
      position,
      lostReason: deal.lostReason,
      closedAt: closed ? now + deal.closeInDays * DAY : undefined,
      updatedAt: now,
    });
    dealIds.set(deal.title, id);
    await ctx.db.insert("timeline", {
      kind: "system",
      accountId: account._id,
      dealId: id,
      actorId: account.ownerId,
      occurredAt: now - 9 * DAY,
      subject: `created the deal ${deal.title}`,
    });
  }

  const drogo = dealIds.get("Earbuds review push")!;
  await ctx.db.insert("proposals", {
    dealId: drogo,
    version: 1,
    status: "sent",
    currency: "INR",
    lines: [
      line("earbuds", "Airdopes 141", 1299, 60),
      line("neckband", "Rockerz 255", 999, 40),
    ],
    validUntil: dayKey(10),
    terms: "Prices per verified sale, excluding GST. Valid for 14 days.",
    createdById: accounts.get("Drogo")!.ownerId,
    sentAt: now - 2 * DAY,
    updatedAt: now - 2 * DAY,
  });
  const kesar = dealIds.get("Nykaa launch pilot")!;
  const kesarOwner = accounts.get("Kesar Leaf Naturals")!.ownerId;
  await ctx.db.insert("proposals", {
    dealId: kesar,
    version: 1,
    status: "draft",
    currency: "INR",
    lines: [line("serum", "Kumkumadi serum 30 ml", 899, 50, 700)],
    validUntil: dayKey(14),
    terms: "Prices per verified sale, excluding GST. Valid for 14 days.",
    createdById: kesarOwner,
    approval: {
      state: "requested",
      requestedById: kesarOwner,
      requestedAt: now - 3 * HOUR,
    },
    updatedAt: now - 3 * HOUR,
  });
  for (const lead of members.filter(
    (item) =>
      (item.role === "admin" || item.role === "manager") &&
      item._id !== kesarOwner,
  )) {
    await notify(ctx, lead._id, {
      kind: "proposal_approval",
      title: "Pricing on Nykaa launch pilot needs approval",
      body: "Blended margin is under 15%.",
      href: `/deals/${kesar}?tab=proposal`,
    });
  }

  for (const [index, task] of TASKS.entries()) {
    const account = accounts.get(task.account)!;
    const done = task.status === "done";
    await ctx.db.insert("tasks", {
      title: task.title,
      status: task.status,
      priority: task.priority,
      assigneeId: member(task.assignee)._id,
      dueDate: dayKey(task.dueInDays),
      accountId: account._id,
      position: index + 1,
      completedAt: done ? now + task.dueInDays * DAY : undefined,
      updatedAt: now,
    });
  }

  for (const [index, item] of LEADS.entries()) {
    const owner = item.owner === undefined ? undefined : member(item.owner);
    const touched = item.status !== "new";
    const { id } = await createLead(
      ctx,
      {
        kind: item.kind,
        name: item.name,
        email: item.email,
        phone: item.phone,
        companyName: item.companyName,
        website: item.website,
        message: item.message,
        source: item.kind === "manual" ? "manual" : "demo_form",
        utm: item.utm,
        landingPage: item.kind === "manual" ? undefined : "/demo",
        ownerId: owner?._id,
        firstTouchedAt: touched ? now - (index + 1) * HOUR : undefined,
        demoAt:
          item.demoInDays === undefined
            ? undefined
            : now + item.demoInDays * DAY,
      },
      {
        announce:
          item.demoInDays !== undefined
            ? "demo_booked"
            : touched
              ? false
              : "lead_new",
      },
    );
    if (item.kind !== "manual") {
      await recordConsents(
        ctx,
        id,
        { email: item.email, phone: item.phone },
        {
          text: "I agree to be contacted by Hypedrive about my enquiry.",
          source: "demo_form",
        },
      );
    }
    const account = item.account ? accounts.get(item.account) : undefined;
    const person = item.account ? people.get(item.account)?.[0] : undefined;
    await ctx.db.patch(id, {
      status: item.status,
      disqualifyReason: item.disqualifyReason,
      ...(account
        ? {
            accountId: account._id,
            personId: person?._id,
            convertedAt: now - 5 * DAY,
          }
        : {}),
    });
    if (touched && owner) {
      await ctx.db.insert("timeline", {
        kind: "call",
        leadId: id,
        accountId: account?._id,
        actorId: owner._id,
        occurredAt: now - (index + 1) * HOUR,
        body: "First call: interested, asked for a demo.",
        outcome: "connected",
        durationMin: 9,
      });
    }
  }

  const welcome = members.find((item) => item.role === "rep");
  if (welcome) {
    await notify(ctx, welcome._id, {
      kind: "lead_assigned",
      title: `${admin.name} assigned you Rahul Jain`,
      body: "Ayurveda Co · linkedin / social",
      href: "/leads",
    });
  }
  await newBrandSignsUp(ctx, now);
  await ctx.scheduler.runAfter(0, internal.platformSync.syncAll, {});
  const seen = await ctx.db
    .query("notifications")
    .withIndex("by_recipient_time", (q) => q.eq("recipientId", admin._id))
    .filter((q) => q.eq(q.field("kind"), "lead_new"))
    .first();
  if (seen) await ctx.db.patch(seen._id, { readAt: now - HOUR });

  const counts: Record<string, number> = {};
  for (const table of APP_TABLES) {
    counts[table] = (await ctx.db.query(table).collect()).length;
  }
  return counts;
}

/** A brand the CRM has never seen signs up and creates an organisation; a platform demo org is ignored. */
async function newBrandSignsUp(ctx: MutationCtx, now: number) {
  const userId = "usr_demo_tinytots";
  const envelopes = [
    {
      type: "user.signed_up",
      occurredAt: now - 5 * HOUR,
      data: {
        user_id: userId,
        email: "kabir@tinytots.in",
        phone: "+919890099900",
        name: "Kabir Anand",
        utm: { source: "google", medium: "cpc", campaign: "brand-search" },
      },
    },
    {
      type: "organization.created",
      occurredAt: now - 4 * HOUR,
      data: {
        org_id: "org_demo_tinytots",
        created_by: userId,
        name: "Tiny Tots",
        website: "https://tinytots.in",
        gstin: "29AAACI4798L1ZU",
        legal_name: "Tiny Tots Retail Private Limited",
      },
    },
    {
      type: "organization.created",
      occurredAt: now - 2 * HOUR,
      data: {
        org_id: "org_demo_qa_sandbox",
        created_by: "usr_demo_qa",
        name: "QA sandbox brand",
        is_demo: true,
      },
    },
  ];
  for (const [index, envelope] of envelopes.entries()) {
    await receive(ctx, { eventId: `evt_demo_tinytots_${index}`, ...envelope });
  }
}

async function recordPersonConsent(
  ctx: MutationCtx,
  personId: Id<"people">,
  consent: Person["consent"],
  actorId: Id<"members">,
) {
  if (!consent) return;
  const text = "Agreed on a call to hear about review campaigns.";
  await appendLedger(ctx, {
    personId,
    channels: ["email", "whatsapp"],
    event: "grant",
    basis: "consent",
    purpose: consent === "updates_only" ? "product_updates" : "sales_outreach",
    source: "call",
    text,
    actorId,
  });
  if (consent === "withdrawn") {
    await appendLedger(ctx, {
      personId,
      channels: ["email", "whatsapp"],
      event: "withdraw",
      source: "email",
      text: "Asked us to stop emailing.",
      actorId,
    });
  }
  if (consent === "dnd") {
    await appendLedger(ctx, {
      personId,
      channels: ["phone"],
      event: "dnd_on",
      source: "other",
      text: "Number is on the NCPR list.",
      actorId,
    });
  }
}

/**
 * Demo workspace data for local development. Run once after the first admin
 * has signed in: `npm run seed:demo`.
 */
export const demo = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (await ctx.db.query("accounts").first()) {
      fail("conflict", "The workspace already has accounts; use seed:reset");
    }
    return await seedWorkspace(ctx);
  },
});

/** Local only: wipes app data (not members, invites or settings) and seeds again. */
export const reset = internalMutation({
  args: {},
  handler: async (ctx) => {
    const site = process.env.SITE_URL ?? "";
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(site)) {
      fail("forbidden", "seed:reset only runs when SITE_URL is localhost");
    }
    for (const table of APP_TABLES) {
      for (const doc of await ctx.db.query(table).collect()) {
        await ctx.db.delete(doc._id);
      }
    }
    return await seedWorkspace(ctx);
  },
});
