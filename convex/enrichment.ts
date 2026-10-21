import { v } from "convex/values";
import { action, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { checkGstin, gstinError, panRoot } from "../lib/domain/gstin";
import { normalizePhone } from "../lib/domain/normalize";
import type { FactStatus } from "../lib/domain/enums";
import { fail, invalid, notFound } from "./lib/errors";
import {
  getViewer,
  internalMutation,
  memberMutation,
  memberQuery,
} from "./lib/functions";
import { accountName, personSearchText } from "./lib/records";
import { logChanges, logSystem } from "./lib/timeline";
import { vFactStatus } from "./lib/validators";
import {
  DIN_PATTERN,
  KYC_ENV_HINT,
  MAX_EVIDENCE,
  REGISTRY_FIELDS,
  SOURCES,
  callKyc,
  clean,
  gstCandidates,
  isRegistryRecord,
  providerMode,
  sameValue,
  sandboxDin,
  sandboxGst,
  sourceFamily,
  type Candidate,
  type DinResult,
  type GstResult,
} from "./lib/enrichment";
import { rateLimiter } from "./lib/rateLimiter";

const STALE_RUN_MS = 2 * 60_000;

const vTarget = v.object({
  accountId: v.optional(v.id("accounts")),
  personId: v.optional(v.id("people")),
});
type Target = typeof vTarget.type;

const vCandidate = v.object({
  field: v.string(),
  value: v.string(),
  strength: v.union(v.literal("authoritative"), v.literal("signal")),
});

const FIELD_LABEL: Record<string, string> = {
  name: "Name",
  phone: "Phone",
  gstin: "GSTIN",
};

function factsFor(ctx: QueryCtx, target: Target) {
  if (target.accountId) {
    return ctx.db
      .query("facts")
      .withIndex("by_account", (q) => q.eq("accountId", target.accountId))
      .collect();
  }
  return ctx.db
    .query("facts")
    .withIndex("by_person", (q) => q.eq("personId", target.personId))
    .collect();
}

function runsFor(ctx: QueryCtx, target: Target) {
  if (target.accountId) {
    return ctx.db
      .query("enrichmentRuns")
      .withIndex("by_account", (q) => q.eq("accountId", target.accountId))
      .collect();
  }
  return ctx.db
    .query("enrichmentRuns")
    .withIndex("by_person", (q) => q.eq("personId", target.personId))
    .collect();
}

function modes() {
  const mode = providerMode(process.env);
  return { gst: mode, din: mode };
}

export const config = memberQuery({
  args: {},
  handler: async () => ({ ...modes(), envHint: KYC_ENV_HINT }),
});

async function summarize(
  ctx: QueryCtx,
  facts: Doc<"facts">[],
  runs: Doc<"enrichmentRuns">[],
) {
  const ids = new Set<Id<"members">>();
  for (const fact of facts) if (fact.decidedById) ids.add(fact.decidedById);
  for (const run of runs) ids.add(run.requestedById);
  const names = new Map<Id<"members">, string>();
  for (const id of ids) {
    const member = await ctx.db.get(id);
    if (member) names.set(id, member.name);
  }
  return {
    facts: facts
      .filter((fact) => fact.status !== "superseded")
      .sort((a, b) => b.observedAt - a.observedAt)
      .map((fact) => ({
        _id: fact._id,
        field: fact.field,
        value: fact.value,
        source: fact.source,
        evidence: fact.evidence,
        observedAt: fact.observedAt,
        status: fact.status,
        decidedBy: fact.decidedById
          ? (names.get(fact.decidedById) ?? null)
          : null,
      })),
    runs: runs
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 5)
      .map((run) => ({
        _id: run._id,
        provider: run.provider,
        status: run.status,
        error: run.error ?? null,
        startedAt: run._creationTime,
        finishedAt: run.finishedAt ?? null,
        requestedBy: names.get(run.requestedById) ?? null,
      })),
  };
}

export const forAccount = memberQuery({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const account = await ctx.db.get(accountId);
    if (!account) return null;
    const [facts, runs] = await Promise.all([
      ctx.db
        .query("facts")
        .withIndex("by_account", (q) => q.eq("accountId", accountId))
        .collect(),
      ctx.db
        .query("enrichmentRuns")
        .withIndex("by_account", (q) => q.eq("accountId", accountId))
        .collect(),
    ]);
    return {
      account: {
        name: account.name,
        gstin: account.gstin ?? null,
        panRoot: account.panRoot ?? null,
      },
      ...(await summarize(ctx, facts, runs)),
    };
  },
});

export const forPerson = memberQuery({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const person = await ctx.db.get(personId);
    if (!person) return null;
    const [facts, runs] = await Promise.all([
      ctx.db
        .query("facts")
        .withIndex("by_person", (q) => q.eq("personId", personId))
        .collect(),
      ctx.db
        .query("enrichmentRuns")
        .withIndex("by_person", (q) => q.eq("personId", personId))
        .collect(),
    ]);
    return {
      person: { phone: person.phone ?? null },
      ...(await summarize(ctx, facts, runs)),
    };
  },
});

/** Authenticates the caller of an action, rate-limits them and opens a run. */
export const startRun = internalMutation({
  args: { target: vTarget, provider: v.string() },
  handler: async (ctx, { target, provider }) => {
    const viewer = await getViewer(ctx);
    if (!viewer) fail("unauthenticated", "Sign in to continue");
    if (viewer.status !== "active") {
      fail("forbidden", "Your access has been removed");
    }
    if (target.accountId && !(await ctx.db.get(target.accountId))) {
      notFound("Account");
    }
    if (target.personId && !(await ctx.db.get(target.personId))) {
      notFound("Person");
    }

    const { ok, retryAfter } = await rateLimiter.limit(ctx, "enrichment", {
      key: viewer._id,
    });
    if (!ok) {
      fail(
        "rate_limited",
        `You've run too many lookups in a minute. Try again in ${Math.ceil(retryAfter / 1000)} s.`,
      );
    }

    const now = Date.now();
    const family = sourceFamily(provider);
    for (const run of await runsFor(ctx, target)) {
      if (run.status !== "running" || sourceFamily(run.provider) !== family) {
        continue;
      }
      if (now - run._creationTime < STALE_RUN_MS) {
        fail("conflict", "A lookup is already running for this record");
      }
      await ctx.db.patch(run._id, {
        status: "failed",
        error: "The lookup timed out",
        finishedAt: now,
      });
    }

    return await ctx.db.insert("enrichmentRuns", {
      ...target,
      provider,
      status: "running",
      requestedById: viewer._id,
    });
  },
});

export const finishRun = internalMutation({
  args: {
    runId: v.id("enrichmentRuns"),
    error: v.optional(v.string()),
    evidence: v.optional(v.string()),
    candidates: v.optional(v.array(vCandidate)),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return;
    const failed = args.error !== undefined || !args.candidates;
    await ctx.db.patch(run._id, {
      status: failed ? "failed" : "succeeded",
      error: args.error,
      finishedAt: Date.now(),
    });
    if (failed) return;
    const evidence = (args.evidence ?? "").slice(0, MAX_EVIDENCE);
    if (run.accountId) {
      await recordGst(ctx, run, evidence, args.candidates!);
    } else if (run.personId) {
      await recordDin(ctx, run, evidence, args.candidates!);
    }
  },
});

type Ledger = {
  ctx: MutationCtx;
  target: Target;
  source: string;
  evidence: string;
  observedAt: number;
  active: Doc<"facts">[];
};

async function supersede(ctx: MutationCtx, facts: Doc<"facts">[]) {
  for (const fact of facts) {
    await ctx.db.patch(fact._id, { status: "superseded" });
    fact.status = "superseded";
  }
}

/**
 * Records one observed value. A value a person already rejected stays
 * rejected; a new registry value replaces the old one; a new suggestion
 * replaces an older pending suggestion but never a human-accepted value.
 */
async function observe(
  ledger: Ledger,
  field: string,
  value: string,
  status: "applied" | "suggested",
) {
  const { ctx, active } = ledger;
  const sameField = active.filter(
    (fact) => fact.field === field && fact.status !== "superseded",
  );
  const replaceable = (fact: Doc<"facts">) =>
    status === "applied"
      ? fact.status === "applied" || fact.status === "suggested"
      : fact.status === "suggested";
  const match = sameField.find((fact) => sameValue(fact.value, value));
  await supersede(
    ctx,
    sameField.filter((fact) => fact !== match && replaceable(fact)),
  );
  if (match) {
    if (match.status === "rejected") return;
    const promote = status === "applied" && match.status === "suggested";
    await ctx.db.patch(match._id, {
      observedAt: ledger.observedAt,
      evidence: ledger.evidence,
      source: ledger.source,
      ...(promote ? { status } : {}),
    });
    return;
  }
  const id = await ctx.db.insert("facts", {
    ...ledger.target,
    field,
    value,
    source: ledger.source,
    evidence: ledger.evidence,
    observedAt: ledger.observedAt,
    status,
  });
  active.push((await ctx.db.get(id))!);
}

async function recordGst(
  ctx: MutationCtx,
  run: Doc<"enrichmentRuns">,
  evidence: string,
  candidates: Candidate[],
) {
  const account = await ctx.db.get(run.accountId!);
  if (!account) return;
  const gstin = candidates.find((item) => item.field === "gstin")!.value;
  const target = { accountId: account._id };
  const active = (await factsFor(ctx, target)).filter(
    (fact) =>
      fact.status !== "superseded" && sourceFamily(fact.source) === "gst",
  );

  const verified = active.find(
    (fact) => fact.field === "gstin" && fact.status === "applied",
  );
  if (verified && verified.value !== gstin) {
    // A rejection is about the value on this account, whichever GSTIN offered it.
    await supersede(
      ctx,
      active.filter((fact) => fact.status !== "rejected"),
    );
  }
  if (account.gstin !== gstin) {
    await ctx.db.patch(account._id, {
      gstin,
      panRoot: panRoot(gstin) ?? undefined,
      updatedAt: Date.now(),
    });
    await logChanges(ctx, target, run.requestedById, [
      { field: "GSTIN", from: account.gstin, to: gstin },
    ]);
  }

  const ledger: Ledger = {
    ctx,
    target,
    source: run.provider,
    evidence,
    observedAt: Date.now(),
    active: active.filter((fact) => fact.status !== "superseded"),
  };
  const registered = candidates.filter(
    (item) => item.field === "legalName" || item.field === "tradeName",
  );
  for (const candidate of candidates) {
    if (candidate.field === "name") {
      if (registered.some((item) => sameValue(account.name, item.value))) {
        await supersede(
          ctx,
          ledger.active.filter(
            (fact) => fact.field === "name" && fact.status === "suggested",
          ),
        );
        continue;
      }
    }
    await observe(
      ledger,
      candidate.field,
      candidate.value,
      candidate.strength === "authoritative" ? "applied" : "suggested",
    );
  }

  const present = new Set(candidates.map((item) => item.field));
  await supersede(
    ctx,
    ledger.active.filter(
      (fact) =>
        fact.status === "applied" &&
        (REGISTRY_FIELDS as readonly string[]).includes(fact.field) &&
        !present.has(fact.field),
    ),
  );

  const status = candidates.find((item) => item.field === "gstStatus")?.value;
  await logSystem(
    ctx,
    target,
    run.provider === SOURCES.gstSandbox
      ? "verified the GSTIN against the enrichment sandbox"
      : "verified the GSTIN with the GST registry",
    [gstin, status].filter(Boolean).join(" · "),
    run.requestedById,
  );
}

async function recordDin(
  ctx: MutationCtx,
  run: Doc<"enrichmentRuns">,
  evidence: string,
  candidates: Candidate[],
) {
  const person = await ctx.db.get(run.personId!);
  if (!person) return;
  const target = { personId: person._id };
  const active = (await factsFor(ctx, target)).filter(
    (fact) =>
      fact.status !== "superseded" && sourceFamily(fact.source) === "din",
  );
  const ledger: Ledger = {
    ctx,
    target,
    source: run.provider,
    evidence,
    observedAt: Date.now(),
    active,
  };
  for (const candidate of candidates) {
    const matches =
      candidate.field === "phone" && sameValue(person.phone, candidate.value);
    await observe(
      ledger,
      candidate.field,
      candidate.value,
      matches ? "applied" : "suggested",
    );
  }
}

type GstOutcome = { ok: true } | { ok: false; error: string };

export const verifyGst = action({
  args: { accountId: v.id("accounts"), gstin: v.string() },
  handler: async (ctx, args): Promise<GstOutcome> => {
    const check = checkGstin(args.gstin);
    if (!check.ok) invalid("gstin", gstinError(check) ?? "Enter a GSTIN");
    const mode = providerMode(process.env);
    if (!mode)
      fail("forbidden", `GST lookup isn't configured. ${KYC_ENV_HINT}`);
    const runId: Id<"enrichmentRuns"> = await ctx.runMutation(
      internal.enrichment.startRun,
      {
        target: { accountId: args.accountId },
        provider: mode === "sandbox" ? SOURCES.gstSandbox : SOURCES.gst,
      },
    );
    const failRun = async (error: string): Promise<GstOutcome> => {
      await ctx.runMutation(internal.enrichment.finishRun, { runId, error });
      return { ok: false, error };
    };
    try {
      const reply =
        mode === "sandbox"
          ? sandboxGst(check.gstin)
          : await callKyc<GstResult>(process.env, "/v1/verify/gst", {
              gstin: check.gstin,
            });
      if (!reply.ok) return await failRun(reply.error);
      if (!isRegistryRecord(reply.data))
        return await failRun("GSTIN not found");
      await ctx.runMutation(internal.enrichment.finishRun, {
        runId,
        evidence: reply.evidence,
        candidates: gstCandidates(check.gstin, reply.data),
      });
      return { ok: true };
    } catch (error) {
      console.error("GST lookup failed", error);
      return await failRun("The GST lookup failed unexpectedly. Try again.");
    }
  },
});

export const lookupDin = action({
  args: { personId: v.id("people"), din: v.string() },
  handler: async (ctx, args): Promise<GstOutcome> => {
    const din = args.din.replace(/\s/g, "");
    if (!DIN_PATTERN.test(din)) invalid("din", "A DIN has 8 digits");
    const mode = providerMode(process.env);
    if (!mode)
      fail("forbidden", `DIN lookup isn't configured. ${KYC_ENV_HINT}`);
    const runId: Id<"enrichmentRuns"> = await ctx.runMutation(
      internal.enrichment.startRun,
      {
        target: { personId: args.personId },
        provider: mode === "sandbox" ? SOURCES.dinSandbox : SOURCES.din,
      },
    );
    const failRun = async (error: string): Promise<GstOutcome> => {
      await ctx.runMutation(internal.enrichment.finishRun, { runId, error });
      return { ok: false, error };
    };
    try {
      const reply =
        mode === "sandbox"
          ? sandboxDin(din)
          : await callKyc<DinResult>(process.env, "/v1/verify/din", { din });
      if (!reply.ok) return await failRun(reply.error);
      if (!reply.data?.isValid) return await failRun("DIN not found");
      const raw = clean(reply.data.phoneNumber);
      if (!raw)
        return await failRun("No phone number is registered for this DIN");
      await ctx.runMutation(internal.enrichment.finishRun, {
        runId,
        evidence: reply.evidence,
        candidates: [
          {
            field: "phone",
            value: normalizePhone(raw) ?? raw,
            strength: "signal",
          },
        ],
      });
      return { ok: true };
    } catch (error) {
      console.error("DIN lookup failed", error);
      return await failRun("The DIN lookup failed unexpectedly. Try again.");
    }
  },
});

async function recordValue(ctx: QueryCtx, fact: Doc<"facts">) {
  if (fact.accountId && fact.field === "name") {
    return (await ctx.db.get(fact.accountId))?.name;
  }
  if (fact.personId && fact.field === "phone") {
    return (await ctx.db.get(fact.personId))?.phone;
  }
  return undefined;
}

/** Writes an accepted value onto the record it came from, returning the old value. */
async function applyToRecord(
  ctx: MutationCtx,
  fact: Doc<"facts">,
  value: string | null,
  actorId: Id<"members">,
) {
  if (fact.accountId && fact.field === "name") {
    const account = await ctx.db.get(fact.accountId);
    if (!account) notFound("Account");
    const name = accountName(value);
    if (name === account.name) return { previous: account.name };
    await ctx.db.patch(account._id, { name, updatedAt: Date.now() });
    await logChanges(ctx, { accountId: account._id }, actorId, [
      { field: FIELD_LABEL.name, from: account.name, to: name },
    ]);
    return { previous: account.name };
  }
  if (fact.personId && fact.field === "phone") {
    const person = await ctx.db.get(fact.personId);
    if (!person) notFound("Person");
    const phone = value === null ? undefined : normalizePhone(value);
    if (phone === null) {
      invalid("phone", "This number can't be saved as a phone number");
    }
    const previous = person.phone ?? null;
    if (phone === person.phone) return { previous };
    const next = { ...person, phone };
    const account = person.accountId
      ? await ctx.db.get(person.accountId)
      : null;
    await ctx.db.patch(person._id, {
      phone,
      searchText: personSearchText(next, account?.name),
      updatedAt: Date.now(),
    });
    await logChanges(ctx, { personId: person._id }, actorId, [
      { field: FIELD_LABEL.phone, from: person.phone, to: phone },
    ]);
    return { previous };
  }
  return null;
}

/** Accepts or rejects a suggestion; returns what `undoDecision` needs. */
export const decide = memberMutation({
  args: {
    factId: v.id("facts"),
    decision: v.union(v.literal("accept"), v.literal("reject")),
  },
  handler: async (ctx, { factId, decision }) => {
    const fact = await ctx.db.get(factId);
    if (!fact) notFound("Suggestion");
    if (fact.status !== "suggested") {
      fail("conflict", "Someone already decided this suggestion");
    }
    const replaced: { id: Id<"facts">; status: FactStatus }[] = [];
    let record: { previous: string | null } | null = null;
    if (decision === "accept") {
      record = await applyToRecord(ctx, fact, fact.value, ctx.viewer._id);
      const target = { accountId: fact.accountId, personId: fact.personId };
      const others = (await factsFor(ctx, target)).filter(
        (other) =>
          other._id !== fact._id &&
          other.field === fact.field &&
          (other.status === "accepted" ||
            (other.status === "applied" &&
              !(REGISTRY_FIELDS as readonly string[]).includes(other.field))),
      );
      for (const other of others) {
        replaced.push({ id: other._id, status: other.status });
        await ctx.db.patch(other._id, { status: "superseded" });
      }
    }
    await ctx.db.patch(fact._id, {
      status: decision === "accept" ? "accepted" : "rejected",
      decidedById: ctx.viewer._id,
    });
    return { factId, record, replaced };
  },
});

export const undoDecision = memberMutation({
  args: {
    factId: v.id("facts"),
    record: v.union(
      v.object({ previous: v.union(v.string(), v.null()) }),
      v.null(),
    ),
    replaced: v.array(v.object({ id: v.id("facts"), status: vFactStatus })),
  },
  handler: async (ctx, { factId, record, replaced }) => {
    const fact = await ctx.db.get(factId);
    if (!fact) notFound("Suggestion");
    if (fact.status !== "accepted" && fact.status !== "rejected") {
      fail("conflict", "This suggestion changed since, so it can't be undone");
    }
    if (fact.status === "accepted" && record) {
      const current = await recordValue(ctx, fact);
      if (current !== undefined && sameValue(current, fact.value)) {
        await applyToRecord(ctx, fact, record.previous, ctx.viewer._id);
      }
    }
    for (const item of replaced) {
      const other = await ctx.db.get(item.id);
      if (
        other?.status === "superseded" &&
        other.accountId === fact.accountId &&
        other.personId === fact.personId
      ) {
        await ctx.db.patch(other._id, { status: item.status });
      }
    }
    await ctx.db.patch(fact._id, {
      status: "suggested",
      decidedById: undefined,
    });
  },
});

/** Deletes every fact and run on a record. Run from the dashboard or CLI. */
export const purge = internalMutation({
  args: {
    accountId: v.optional(v.id("accounts")),
    personId: v.optional(v.id("people")),
  },
  handler: async (ctx, target) => {
    if (!target.accountId === !target.personId) {
      invalid("target", "Pass exactly one of accountId or personId");
    }
    const facts = await factsFor(ctx, target);
    const runs = await runsFor(ctx, target);
    for (const doc of [...facts, ...runs]) await ctx.db.delete(doc._id);
    return { facts: facts.length, runs: runs.length };
  },
});
