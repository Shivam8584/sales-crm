import { v } from "convex/values";
import {
  httpAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { checkGstin, panRoot } from "../lib/domain/gstin";
import type { LeadKind, LeadStatus } from "../lib/domain/enums";
import {
  CONSENT_TEXT,
  LEAD_LIMITS,
  companyDomain,
  orderBandLabel,
  parseLeadSubmission,
  splitName,
} from "../lib/domain/leads";
import {
  cleanText,
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
} from "../lib/domain/normalize";
import { fail, invalid, notFound } from "./lib/errors";
import { memberMutation, memberQuery } from "./lib/functions";
import {
  allowedOrigins,
  clientIp,
  corsHeaders,
  json,
  originAllowed,
  parseJsonObject,
  preflight,
  rateLimit,
  readBody,
  readJson,
  siteOrigins,
  verifyHmac,
} from "./lib/http";
import {
  createLead,
  findRecentOpenLead,
  isOpen,
  leadChannel,
  leadHref,
  leadSummary,
  recordConsents,
  slaSeconds,
} from "./lib/leads";
import {
  memberIndex,
  memberRef,
  personSearchText,
  requireActiveMember,
} from "./lib/records";
import { logSystem } from "./lib/timeline";
import { vDisqualifyReason, vLeadStatus, vUtm } from "./lib/validators";
import { leadershipIds, notify, notifyMany } from "./notifications";

const LIST_LIMIT = 2000;
const FORM_SOURCE = "demo_form";
const FORM_RATE_LIMIT = 5;
const FORM_RATE_WINDOW_MS = 60_000;
const MIN_FILL_MS = 2000;
const WEBHOOK_BODY_LIMIT = 256 * 1024;
// Moving a lead into one of these means someone spoke to them; disqualifying spam does not.
const WORKED_STATUSES: LeadStatus[] = ["contacted", "qualified", "nurture"];
const KIND_NOUN: Record<LeadKind, string> = {
  demo: "demo request",
  contact: "contact request",
  signup: "platform signup",
  manual: "lead",
};

async function requireLead(ctx: MutationCtx, id: Id<"leads">) {
  const lead = await ctx.db.get(id);
  if (!lead) notFound("Lead");
  return lead;
}

export const list = memberQuery({
  args: {},
  handler: async (ctx) => {
    const [leads, members] = await Promise.all([
      ctx.db.query("leads").order("desc").take(LIST_LIMIT),
      memberIndex(ctx),
    ]);
    return {
      slaMs: slaSeconds() * 1000,
      leads: leads.map((lead) => ({
        _id: lead._id,
        _creationTime: lead._creationTime,
        kind: lead.kind,
        name: lead.name,
        email: lead.email ?? null,
        phone: lead.phone ?? null,
        companyName: lead.companyName,
        source: lead.source,
        channel: leadChannel(lead),
        utm: lead.utm,
        status: lead.status,
        owner: memberRef(members, lead.ownerId),
        firstTouchedAt: lead.firstTouchedAt ?? null,
        slaBreachedAt: lead.slaBreachedAt ?? null,
        demoAt: lead.demoAt ?? null,
      })),
    };
  },
});

/** The viewer's new leads, the longest-waiting untouched ones first. */
export const waiting = memberQuery({
  args: {},
  handler: async (ctx) => {
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerId", ctx.viewer._id).eq("status", "new"),
      )
      .take(100);
    return {
      slaMs: slaSeconds() * 1000,
      leads: leads
        .sort(
          (a, b) =>
            Number(Boolean(a.firstTouchedAt)) -
              Number(Boolean(b.firstTouchedAt)) ||
            a._creationTime - b._creationTime,
        )
        .map((lead) => ({
          _id: lead._id,
          _creationTime: lead._creationTime,
          name: lead.name,
          companyName: lead.companyName,
          kind: lead.kind,
          status: lead.status,
          firstTouchedAt: lead.firstTouchedAt ?? null,
          slaBreachedAt: lead.slaBreachedAt ?? null,
          demoAt: lead.demoAt ?? null,
        })),
    };
  },
});

/** Takes a raw string because the id comes from the URL and may be stale or mistyped. */
export const get = memberQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("leads", args.id);
    const lead = id ? await ctx.db.get(id) : null;
    if (!id || !lead) return null;
    const converted = lead.status === "converted";
    const [members, consents, account, matchedAccount, matchedPerson] =
      await Promise.all([
        memberIndex(ctx),
        ctx.db
          .query("consents")
          .withIndex("by_lead", (q) => q.eq("leadId", id))
          .collect(),
        lead.accountId ? ctx.db.get(lead.accountId) : null,
        converted ? null : matchAccount(ctx, lead),
        converted ? null : matchPerson(ctx, lead),
      ]);
    return {
      ...lead,
      channel: leadChannel(lead),
      slaMs: slaSeconds() * 1000,
      owner: memberRef(members, lead.ownerId),
      account: account ? { _id: account._id, name: account.name } : null,
      matches: {
        account: matchedAccount
          ? { _id: matchedAccount._id, name: matchedAccount.name }
          : null,
        person: matchedPerson
          ? {
              _id: matchedPerson._id,
              name: `${matchedPerson.firstName} ${matchedPerson.lastName}`.trim(),
            }
          : null,
      },
      consents: consents
        .sort((a, b) => b.recordedAt - a.recordedAt)
        .map(({ _id, channel, granted, text, source, recordedAt }) => ({
          _id,
          channel,
          granted,
          text,
          source,
          recordedAt,
        })),
    };
  },
});

type ContactFields = {
  name: string;
  email?: string;
  phone?: string;
  companyName: string;
  website?: string;
  gstin?: string;
  message?: string;
};

function cleanManual(args: {
  [K in keyof ContactFields]?: string | undefined;
}) {
  const name = cleanText(args.name);
  if (!name) invalid("name", "Enter the lead's name");
  if (name.length > LEAD_LIMITS.name) invalid("name", "Name is too long");
  const companyName = cleanText(args.companyName);
  if (!companyName) invalid("companyName", "Enter the brand or company");
  if (companyName.length > LEAD_LIMITS.companyName) {
    invalid("companyName", "Company name is too long");
  }
  const out: ContactFields = { name, companyName };
  if (args.email?.trim()) {
    const email = normalizeEmail(args.email);
    if (!email) invalid("email", "Enter a valid email address");
    out.email = email;
  }
  if (args.phone?.trim()) {
    const phone = normalizePhone(args.phone);
    if (!phone) invalid("phone", "Enter a mobile number like 98200 12345");
    out.phone = phone;
  }
  if (!out.email && !out.phone) {
    invalid("email", "Add an email or a phone number");
  }
  const website = cleanText(args.website);
  if (website) {
    if (website.length > LEAD_LIMITS.website || !normalizeDomain(website)) {
      invalid("website", "Enter a website like brand.in");
    }
    out.website = website;
  }
  if (args.gstin?.trim()) {
    const check = checkGstin(args.gstin);
    if (!check.ok) invalid("gstin", "Enter a valid 15-character GSTIN");
    out.gstin = check.gstin;
  }
  const message = args.message?.trim();
  if (message) {
    if (message.length > LEAD_LIMITS.message) {
      invalid("message", "Notes are too long");
    }
    out.message = message;
  }
  return out;
}

/** A lead typed in by a teammate. Owning it yourself counts as the first touch. */
export const create = memberMutation({
  args: {
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    companyName: v.string(),
    website: v.optional(v.string()),
    gstin: v.optional(v.string()),
    message: v.optional(v.string()),
    ownerId: v.optional(v.id("members")),
  },
  handler: async (ctx, { ownerId: requested, ...args }) => {
    const fields = cleanManual(args);
    const ownerId = requested ?? ctx.viewer._id;
    await requireActiveMember(ctx, ownerId, "ownerId");
    const duplicate = await findRecentOpenLead(ctx, fields.email, fields.phone);
    if (duplicate) {
      fail(
        "conflict",
        `${duplicate.name} already has an open lead from today`,
        fields.email ? "email" : "phone",
      );
    }
    const mine = ownerId === ctx.viewer._id;
    const { id } = await createLead(
      ctx,
      {
        ...fields,
        kind: "manual",
        source: "manual",
        utm: {},
        ownerId,
        firstTouchedAt: mine ? Date.now() : undefined,
      },
      { announce: false },
    );
    if (mine) await ctx.db.patch(id, { status: "contacted" });
    else {
      await notify(ctx, ownerId, {
        kind: "lead_assigned",
        title: `${ctx.viewer.name} assigned you ${fields.name}`,
        body: fields.companyName,
        href: leadHref(id),
      });
    }
    return id;
  },
});

/** Working an unowned lead claims it; any first contact stops the SLA clock. */
function touchPatch(lead: Doc<"leads">, viewerId: Id<"members">) {
  const now = Date.now();
  const patch: Partial<Doc<"leads">> = {};
  if (!lead.firstTouchedAt) patch.firstTouchedAt = now;
  if (!lead.ownerId) {
    patch.ownerId = viewerId;
    patch.assignedAt = now;
  }
  return patch;
}

/** Records a call, email or WhatsApp opened from the CRM. */
export const touch = memberMutation({
  args: {
    id: v.id("leads"),
    channel: v.union(
      v.literal("call"),
      v.literal("email"),
      v.literal("whatsapp"),
    ),
  },
  handler: async (ctx, { id }) => {
    const lead = await requireLead(ctx, id);
    const patch = touchPatch(lead, ctx.viewer._id);
    if (Object.keys(patch).length > 0) await ctx.db.patch(id, patch);
    return { firstTouch: patch.firstTouchedAt !== undefined };
  },
});

/** Returns the previous status and reason so the client can offer undo. */
export const setStatus = memberMutation({
  args: {
    id: v.id("leads"),
    status: vLeadStatus,
    reason: v.optional(vDisqualifyReason),
  },
  handler: async (ctx, { id, status, reason }) => {
    const lead = await requireLead(ctx, id);
    const previous = {
      status: lead.status,
      reason: lead.disqualifyReason ?? undefined,
    };
    if (lead.status === "converted") {
      fail("conflict", "This lead is already converted");
    }
    if (status === "converted") {
      fail("invalid", "Use Convert to turn a lead into an account", "status");
    }
    if (status === "disqualified" && !reason) {
      invalid("reason", "Pick a reason to disqualify this lead");
    }
    await ctx.db.patch(id, {
      ...(WORKED_STATUSES.includes(status)
        ? touchPatch(lead, ctx.viewer._id)
        : {}),
      status,
      disqualifyReason: status === "disqualified" ? reason : undefined,
    });
    return previous;
  },
});

/** Reassigning is not a touch. Returns the previous owner for undo. */
export const assign = memberMutation({
  args: { id: v.id("leads"), ownerId: v.union(v.id("members"), v.null()) },
  handler: async (ctx, { id, ownerId }) => {
    const lead = await requireLead(ctx, id);
    const previous = lead.ownerId ?? null;
    if (ownerId === previous) return previous;
    if (ownerId) await requireActiveMember(ctx, ownerId, "ownerId");
    await ctx.db.patch(id, {
      ownerId: ownerId ?? undefined,
      assignedAt: ownerId ? Date.now() : undefined,
    });
    if (ownerId && ownerId !== ctx.viewer._id) {
      await notify(ctx, ownerId, {
        kind: "lead_assigned",
        title: `${ctx.viewer.name} assigned you ${lead.name}`,
        body: leadSummary(lead),
        href: leadHref(id),
      });
    }
    return previous;
  },
});

async function matchAccount(ctx: QueryCtx, lead: Doc<"leads">) {
  const pan = lead.gstin ? panRoot(lead.gstin) : null;
  if (pan) {
    const byPan = await ctx.db
      .query("accounts")
      .withIndex("by_pan_root", (q) => q.eq("panRoot", pan))
      .collect();
    const match = byPan.find((account) => !account.archivedAt);
    if (match) return match;
  }
  const domain = companyDomain(lead.website);
  if (domain) {
    const byDomain = await ctx.db
      .query("accounts")
      .withIndex("by_domain", (q) => q.eq("domain", domain))
      .collect();
    const match = byDomain.find((account) => !account.archivedAt);
    if (match) return match;
  }
  return null;
}

async function matchPerson(ctx: QueryCtx, lead: Doc<"leads">) {
  if (lead.email) {
    const byEmail = await ctx.db
      .query("people")
      .withIndex("by_email", (q) => q.eq("email", lead.email))
      .collect();
    const match = byEmail.find((person) => !person.archivedAt);
    if (match) return match;
  }
  if (lead.phone) {
    const byPhone = await ctx.db
      .query("people")
      .withIndex("by_phone", (q) => q.eq("phone", lead.phone))
      .collect();
    const match = byPhone.find((person) => !person.archivedAt);
    if (match) return match;
  }
  return null;
}

/**
 * Turns a lead into an account and a person, reusing an account with the same
 * GSTIN PAN or website and a person with the same email or phone.
 */
export const convert = memberMutation({
  args: { id: v.id("leads") },
  handler: async (ctx, { id }) => {
    const lead = await requireLead(ctx, id);
    if (lead.status === "converted") {
      fail("conflict", "This lead is already converted");
    }
    const now = Date.now();
    const ownerId = lead.ownerId ?? ctx.viewer._id;
    const actor = ctx.viewer._id;

    let account = await matchAccount(ctx, lead);
    const accountMatched = account !== null;
    if (account) {
      const patch: Partial<Doc<"accounts">> = {
        lastActivityAt: now,
        updatedAt: now,
      };
      if (lead.gstin && !account.gstin) {
        patch.gstin = lead.gstin;
        patch.panRoot = panRoot(lead.gstin) ?? undefined;
      }
      await ctx.db.patch(account._id, patch);
    } else {
      const domain = companyDomain(lead.website) ?? undefined;
      const accountId = await ctx.db.insert("accounts", {
        name: lead.companyName,
        domain,
        ownerId,
        stage: lead.demoAt
          ? "demo"
          : lead.status === "qualified"
            ? "qualified"
            : "lead",
        tags: [],
        gstin: lead.gstin,
        panRoot: lead.gstin ? (panRoot(lead.gstin) ?? undefined) : undefined,
        updatedAt: now,
        lastActivityAt: now,
      });
      account = (await ctx.db.get(accountId))!;
      await logSystem(
        ctx,
        { accountId },
        `created the account from a ${KIND_NOUN[lead.kind]}`,
        undefined,
        actor,
      );
    }

    let person = await matchPerson(ctx, lead);
    const personMatched = person !== null;
    if (person) {
      const patch: Partial<Doc<"people">> = { updatedAt: now };
      if (!person.accountId) patch.accountId = account._id;
      if (!person.email && lead.email) patch.email = lead.email;
      if (!person.phone && lead.phone) patch.phone = lead.phone;
      const next = { ...person, ...patch };
      const accountName =
        next.accountId === account._id
          ? account.name
          : next.accountId
            ? (await ctx.db.get(next.accountId))?.name
            : undefined;
      patch.searchText = personSearchText(next, accountName);
      await ctx.db.patch(person._id, patch);
    } else {
      const { firstName, lastName } = splitName(lead.name);
      const draft = {
        firstName,
        lastName,
        email: lead.email,
        phone: lead.phone,
        accountId: account._id,
        ownerId,
        tags: [],
        updatedAt: now,
        lastActivityAt: now,
      };
      const personId = await ctx.db.insert("people", {
        ...draft,
        searchText: personSearchText(draft, account.name),
      });
      person = (await ctx.db.get(personId))!;
      await logSystem(
        ctx,
        { personId, accountId: account._id },
        `added ${lead.name} from a lead`,
        undefined,
        actor,
      );
    }

    const consents = await ctx.db
      .query("consents")
      .withIndex("by_lead", (q) => q.eq("leadId", id))
      .collect();
    for (const consent of consents) {
      if (!consent.personId) {
        await ctx.db.patch(consent._id, { personId: person._id });
      }
    }

    const history = await ctx.db
      .query("timeline")
      .withIndex("by_lead", (q) => q.eq("leadId", id))
      .collect();
    for (const entry of history) {
      await ctx.db.patch(entry._id, {
        accountId: entry.accountId ?? account._id,
        personId: entry.personId ?? person._id,
      });
    }

    const details = [
      `Source: ${leadChannel(lead)}`,
      lead.utm.campaign && `Campaign: ${lead.utm.campaign}`,
      lead.landingPage && `Landing page: ${lead.landingPage}`,
      lead.message,
    ]
      .filter(Boolean)
      .join("\n");
    await logSystem(
      ctx,
      { accountId: account._id, personId: person._id },
      `converted ${lead.name}'s ${KIND_NOUN[lead.kind]}`,
      details,
      actor,
    );

    await ctx.db.patch(id, {
      ...touchPatch(lead, actor),
      status: "converted",
      disqualifyReason: undefined,
      accountId: account._id,
      personId: person._id,
      convertedAt: now,
    });

    return {
      accountId: account._id,
      accountName: account.name,
      accountMatched,
      personMatched,
    };
  },
});

export const forAlert = internalQuery({
  args: { id: v.id("leads") },
  handler: async (ctx, { id }) => {
    const lead = await ctx.db.get(id);
    if (!lead) return null;
    const owner = lead.ownerId ? await ctx.db.get(lead.ownerId) : null;
    return {
      ...lead,
      owner: owner ? { name: owner.name, email: owner.email } : null,
    };
  },
});

function spokenDuration(ms: number) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

export const checkSla = internalMutation({
  args: { id: v.id("leads") },
  handler: async (ctx, { id }) => {
    const lead = await ctx.db.get(id);
    if (!lead || lead.firstTouchedAt || lead.slaBreachedAt || !isOpen(lead)) {
      return;
    }
    const now = Date.now();
    await ctx.db.patch(id, { slaBreachedAt: now });
    const owner = lead.ownerId ? await ctx.db.get(lead.ownerId) : null;
    await notifyMany(ctx, [lead.ownerId, ...(await leadershipIds(ctx))], {
      kind: "lead_sla",
      title: `No reply to ${lead.name} in ${spokenDuration(now - lead._creationTime)}`,
      body: `${lead.companyName} · ${owner ? `Owner: ${owner.name}` : "Unassigned"}`,
      href: leadHref(id),
    });
    await ctx.scheduler.runAfter(0, internal.alerts.send, {
      event: "lead_sla",
      leadId: id,
    });
  },
});

const vSubmission = v.object({
  kind: v.union(v.literal("demo"), v.literal("contact")),
  name: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  companyName: v.string(),
  website: v.optional(v.string()),
  gstin: v.optional(v.string()),
  ordersBand: v.optional(v.string()),
  message: v.optional(v.string()),
  utm: vUtm,
  referrer: v.optional(v.string()),
  landingPage: v.optional(v.string()),
});

function appendMessage(existing: string | undefined, parts: string[]) {
  const fresh = parts.filter((part) => !existing?.includes(part));
  if (fresh.length === 0) return existing;
  return [existing, ...fresh].filter(Boolean).join("\n\n");
}

/** Stores a validated form submission, folding repeats from the last 24 hours into the open lead. */
export const ingest = internalMutation({
  args: { submission: vSubmission, ip: v.optional(v.string()) },
  handler: async (ctx, { submission, ip }) => {
    const { ordersBand, kind, ...fields } = submission;
    const band = orderBandLabel(ordersBand);
    const parts = [band && `Monthly orders: ${band}`, fields.message].filter(
      (part): part is string => Boolean(part),
    );
    const message = parts.join("\n\n") || undefined;
    const consent = { text: CONSENT_TEXT, source: FORM_SOURCE, ip };

    const existing = await findRecentOpenLead(ctx, fields.email, fields.phone);
    if (existing) {
      await ctx.db.patch(existing._id, {
        email: existing.email ?? fields.email,
        phone: existing.phone ?? fields.phone,
        website: existing.website ?? fields.website,
        gstin: existing.gstin ?? fields.gstin,
        message: appendMessage(existing.message, parts),
      });
      await recordConsents(ctx, existing._id, fields, consent);
      const input = {
        kind: "lead_repeat",
        title: `${existing.name} submitted the form again`,
        body: leadSummary(existing),
        href: leadHref(existing._id),
      };
      if (existing.ownerId) await notify(ctx, existing.ownerId, input);
      else await notifyMany(ctx, await leadershipIds(ctx), input);
      return { id: existing._id, created: false };
    }

    const { id } = await createLead(ctx, {
      ...fields,
      message,
      kind,
      source: FORM_SOURCE,
    });
    await recordConsents(ctx, id, fields, consent);
    return { id, created: true };
  },
});

const BOOKING = {
  created: { kind: "demo_booked", verb: "booked" },
  rescheduled: { kind: "demo_rescheduled", verb: "rescheduled" },
  cancelled: { kind: "demo_cancelled", verb: "cancelled" },
} as const;

const IST = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export const recordBooking = internalMutation({
  args: {
    event: v.union(
      v.literal("created"),
      v.literal("rescheduled"),
      v.literal("cancelled"),
    ),
    leadId: v.optional(v.string()),
    email: v.string(),
    name: v.string(),
    phone: v.optional(v.string()),
    startTime: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email) ?? undefined;
    const { kind, verb } = BOOKING[args.event];

    let lead: Doc<"leads"> | null = null;
    const byId = args.leadId ? ctx.db.normalizeId("leads", args.leadId) : null;
    if (byId) lead = await ctx.db.get(byId);
    if (!lead && email) {
      const matches = await ctx.db
        .query("leads")
        .withIndex("by_email", (q) => q.eq("email", email))
        .order("desc")
        .take(20);
      lead = matches.find(isOpen) ?? matches[0] ?? null;
    }

    if (!lead) {
      if (args.event === "cancelled") return null;
      const domain = email ? companyDomain(email.split("@")[1]) : null;
      const name = cleanText(args.name) ?? email ?? "Unknown";
      const { id } = await createLead(
        ctx,
        {
          kind: "demo",
          source: "calcom",
          name,
          email,
          phone: args.phone,
          companyName: domain ?? name,
          website: domain ?? undefined,
          message: args.notes,
          utm: {},
          demoAt: args.startTime,
        },
        { announce: "demo_booked" },
      );
      return id;
    }

    await ctx.db.patch(lead._id, {
      demoAt: args.event === "cancelled" ? undefined : args.startTime,
      phone: lead.phone ?? args.phone,
      email: lead.email ?? email,
    });
    const when =
      args.startTime && args.event !== "cancelled"
        ? ` · ${IST.format(args.startTime)} IST`
        : "";
    const input = {
      kind,
      title: `${lead.name} ${verb} a demo`,
      body: `${lead.companyName}${when}`,
      href: leadHref(lead._id),
    };
    if (lead.ownerId) await notify(ctx, lead.ownerId, input);
    else await notifyMany(ctx, await leadershipIds(ctx), input);
    await ctx.scheduler.runAfter(0, internal.alerts.send, {
      event: kind,
      leadId: lead._id,
    });
    return lead._id;
  },
});

function formOrigins() {
  return allowedOrigins("LEAD_FORM_ORIGINS", siteOrigins());
}

export const submitPreflight = httpAction(async (_ctx, request) =>
  preflight(request, formOrigins()),
);

/** Public demo-form endpoint: CORS-limited, rate-limited, honeypot-guarded. */
export const submit = httpAction(async (ctx, request) => {
  const origins = formOrigins();
  const cors = corsHeaders(request, origins);
  if (!originAllowed(request, origins)) {
    return json({ ok: false, error: "Origin not allowed" }, 403, cors);
  }
  const ip = clientIp(request);
  if (
    !(await rateLimit(ctx, `leads:${ip}`, FORM_RATE_LIMIT, FORM_RATE_WINDOW_MS))
  ) {
    return json(
      { ok: false, error: "Too many requests. Try again in a minute." },
      429,
      { ...cors, "Retry-After": "60" },
    );
  }
  const body = await readJson(request);
  if (!body.ok)
    return json({ ok: false, error: body.error }, body.status, cors);
  const { value } = body;

  const elapsed = Number(value.elapsedMs);
  const trapped = typeof value.fax === "string" && value.fax.trim() !== "";
  if (trapped || !Number.isFinite(elapsed) || elapsed < MIN_FILL_MS) {
    return json({ ok: true }, 200, cors);
  }

  const parsed = parseLeadSubmission(value);
  if (!parsed.ok) {
    return json(
      {
        ok: false,
        error: "Check the highlighted fields",
        errors: parsed.errors,
      },
      422,
      cors,
    );
  }
  const result = await ctx.runMutation(internal.leads.ingest, {
    submission: {
      ...parsed.value,
      kind: value.kind === "contact" ? "contact" : "demo",
    },
    ip: ip === "unknown" ? undefined : ip,
  });
  return json({ ok: true, leadId: result.id }, 200, cors);
});

const CALCOM_EVENTS = {
  BOOKING_CREATED: "created",
  BOOKING_RESCHEDULED: "rescheduled",
  BOOKING_CANCELLED: "cancelled",
} as const;

function pick(source: unknown, ...path: string[]): unknown {
  let current = source;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function str(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Cal.com booking webhook, verified with `X-Cal-Signature-256`. */
export const calcomWebhook = httpAction(async (ctx, request) => {
  const secret = process.env.CALCOM_WEBHOOK_SECRET;
  if (!secret) {
    console.error("CALCOM_WEBHOOK_SECRET is not set; rejecting webhook");
    return json({ ok: false, error: "Webhook not configured" }, 503);
  }
  const body = await readBody(request, WEBHOOK_BODY_LIMIT);
  if (!body.ok) return json({ ok: false, error: body.error }, body.status);
  const signature = request.headers.get("X-Cal-Signature-256");
  if (!(await verifyHmac(secret, body.raw, signature))) {
    return json({ ok: false, error: "Invalid signature" }, 401);
  }
  const parsed = parseJsonObject(body.raw);
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);

  const trigger = str(parsed.value.triggerEvent);
  const event = trigger
    ? CALCOM_EVENTS[trigger as keyof typeof CALCOM_EVENTS]
    : undefined;
  if (!event) return json({ ok: true, ignored: trigger ?? "unknown" });

  const payload = parsed.value.payload;
  const attendee = pick(payload, "attendees", "0");
  const email =
    str(pick(attendee, "email")) ??
    str(pick(payload, "responses", "email", "value"));
  if (!email) {
    return json({ ok: false, error: "Booking has no attendee email" }, 400);
  }
  const phoneRaw =
    str(pick(attendee, "phoneNumber")) ??
    str(pick(payload, "responses", "attendeePhoneNumber", "value"));
  const start = Date.parse(str(pick(payload, "startTime")) ?? "");

  const leadId = await ctx.runMutation(internal.leads.recordBooking, {
    event,
    leadId: str(pick(payload, "metadata", "leadId")),
    email,
    name:
      str(pick(attendee, "name")) ??
      str(pick(payload, "responses", "name", "value")) ??
      "",
    phone: (phoneRaw && normalizePhone(phoneRaw)) || undefined,
    startTime: Number.isNaN(start) ? undefined : start,
    notes: (
      str(pick(payload, "additionalNotes")) ??
      str(pick(payload, "responses", "notes", "value"))
    )?.slice(0, LEAD_LIMITS.message),
  });
  return json({ ok: true, leadId });
});
