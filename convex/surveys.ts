import { v } from "convex/values";
import {
  httpAction,
  internalQuery,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { addDays, istDay } from "../lib/domain/day";
import {
  COMMENT_EDIT_MS,
  COMMENT_MAX,
  SURVEY_DAY_MS,
  SURVEY_TTL_DAYS,
  cleanComment,
  followUp,
  isScore,
  isSurveyToken,
  newSurveyToken,
  npsOf,
  scoreBucket,
} from "../lib/domain/surveys";
import { sha256Hex } from "./lib/crypto";
import { internalMutation, memberQuery } from "./lib/functions";
import {
  clientIp,
  corsHeaders,
  json,
  originAllowed,
  preflight,
  readJson,
  siteOrigins,
} from "./lib/http";
import { rateLimiter } from "./lib/rateLimiter";
import { upsertAutomatedTask } from "./lib/tasks";
import { logSystem } from "./lib/timeline";
import { leadershipIds, notify } from "./notifications";
import { routes } from "../lib/routes";

const BODY_LIMIT = 4 * 1024;
const MAX_NPS_ROWS = 5000;

/** A request created for this contact in the last 30 days blocks another, answered or not. */
export async function issueSurveyToken(
  ctx: MutationCtx,
  args: {
    accountId: Id<"accounts">;
    personId?: Id<"people">;
    createdById?: Id<"members">;
    via?: string;
  },
) {
  const now = Date.now();
  const recent = await ctx.db
    .query("surveyRequests")
    .withIndex("by_account", (q) =>
      q
        .eq("accountId", args.accountId)
        .gt("createdAt", now - SURVEY_TTL_DAYS * SURVEY_DAY_MS),
    )
    .collect();
  if (recent.some((request) => request.personId === args.personId)) {
    return null;
  }
  const token = newSurveyToken();
  await ctx.db.insert("surveyRequests", {
    tokenHash: await sha256Hex(token),
    accountId: args.accountId,
    personId: args.personId,
    kind: "nps",
    createdAt: now,
    expiresAt: now + SURVEY_TTL_DAYS * SURVEY_DAY_MS,
    createdById: args.createdById,
    via: args.via ?? "sequence",
  });
  return token;
}

/** The raw token, or null when this contact was asked in the last 30 days. */
export const createRequest = internalMutation({
  args: {
    accountId: v.id("accounts"),
    personId: v.optional(v.id("people")),
    createdById: v.optional(v.id("members")),
    via: v.optional(v.string()),
  },
  handler: (ctx, args) => issueSurveyToken(ctx, args),
});

async function requestByHash(ctx: QueryCtx, tokenHash: string) {
  return await ctx.db
    .query("surveyRequests")
    .withIndex("by_hash", (q) => q.eq("tokenHash", tokenHash))
    .first();
}

async function livePerson(ctx: QueryCtx, id: Id<"people"> | undefined) {
  const person = id ? await ctx.db.get(id) : null;
  return person && !person.erasedAt ? person : null;
}

export const info = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const request = await requestByHash(ctx, tokenHash);
    if (!request) return null;
    const account = await ctx.db.get(request.accountId);
    if (!account) return null;
    const person = await livePerson(ctx, request.personId);
    const answered = request.answeredAt !== undefined;
    return {
      brandName: account.name,
      firstName: person?.firstName || undefined,
      expired: !answered && Date.now() >= request.expiresAt,
      answered,
    };
  },
});

async function responsibleMember(ctx: QueryCtx, account: Doc<"accounts">) {
  const owner = await ctx.db.get(account.ownerId);
  if (owner?.status === "active") return owner._id;
  return (await leadershipIds(ctx))[0] ?? null;
}

/** Files a score, then opens the follow-up for promoters and detractors. */
export const respond = internalMutation({
  args: {
    tokenHash: v.string(),
    score: v.number(),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, { tokenHash, score, comment }) => {
    const request = await requestByHash(ctx, tokenHash);
    if (!request) return "invalid" as const;
    const now = Date.now();

    if (request.answeredAt !== undefined) {
      if (now - request.answeredAt > COMMENT_EDIT_MS)
        return "answered" as const;
      if (comment === undefined) return "ok" as const;
      const response = await ctx.db
        .query("surveyResponses")
        .withIndex("by_request", (q) => q.eq("requestId", request._id))
        .first();
      if (response) {
        await ctx.db.patch(response._id, { comment: comment || undefined });
        if (response.entryId) {
          await ctx.db.patch(response.entryId, { body: comment || undefined });
        }
      }
      return "ok" as const;
    }
    if (now >= request.expiresAt) return "expired" as const;

    const account = await ctx.db.get(request.accountId);
    if (!account) return "invalid" as const;
    const person = await livePerson(ctx, request.personId);
    const refs = { accountId: account._id, personId: person?._id };

    const entryId = await logSystem(
      ctx,
      refs,
      `recorded NPS ${score} from ${person?.firstName || account.name}`,
      comment || undefined,
    );
    const requestId = request._id;
    await ctx.db.insert("surveyResponses", {
      requestId,
      ...refs,
      score,
      comment: comment || undefined,
      at: now,
      entryId,
    });
    await ctx.db.patch(requestId, { answeredAt: now });

    const task = followUp(score, account.name);
    const assigneeId = task ? await responsibleMember(ctx, account) : null;
    if (task && assigneeId) {
      const result = await upsertAutomatedTask(ctx, {
        automationKey: `survey:${requestId}`,
        title: task.title,
        priority: task.priority,
        assigneeId,
        dueDate: addDays(istDay(now), task.dueInDays),
        ...refs,
      });
      if (result.outcome === "created") {
        const detractor = scoreBucket(score) === "detractor";
        await notify(ctx, assigneeId, {
          kind: detractor ? "survey_detractor" : "survey_promoter",
          title: `${account.name} gave NPS ${score}`,
          body: detractor
            ? "A rescue task is due today"
            : "A referral task is due in 2 days",
          href: routes.account(account._id),
        });
      }
    }
    return "ok" as const;
  },
});

/** Removes a person's survey comments when they are erased; the scores stay on the account. */
export async function eraseSurveyData(
  ctx: MutationCtx,
  personId: Id<"people">,
) {
  const rows = await ctx.db
    .query("surveyResponses")
    .withIndex("by_person", (q) => q.eq("personId", personId))
    .take(200);
  for (const row of rows) {
    await ctx.db.patch(row._id, { personId: undefined, comment: undefined });
  }
}

// ── In-app ──────────────────────────────────────────────────────────────────

/** The five latest answers for an account or a person. */
export const forRecord = memberQuery({
  args: {
    accountId: v.optional(v.id("accounts")),
    personId: v.optional(v.id("people")),
  },
  handler: async (ctx, { accountId, personId }) => {
    const query = ctx.db.query("surveyResponses");
    const rows = personId
      ? await query
          .withIndex("by_person", (q) => q.eq("personId", personId))
          .order("desc")
          .take(5)
      : accountId
        ? await query
            .withIndex("by_account", (q) => q.eq("accountId", accountId))
            .order("desc")
            .take(5)
        : [];
    return rows.map((row) => ({
      id: row._id,
      score: row.score,
      comment: row.comment,
      at: row.at,
    }));
  },
});

/** Promoters minus detractors over the last `days`, from the workspace's answers. */
export const nps = memberQuery({
  args: { days: v.number() },
  handler: async (ctx, { days }) => {
    const span = Math.min(Math.max(Math.floor(days) || 90, 1), 365);
    const rows = await ctx.db
      .query("surveyResponses")
      .withIndex("by_at", (q) => q.gte("at", Date.now() - span * SURVEY_DAY_MS))
      .take(MAX_NPS_ROWS);
    return { days: span, ...npsOf(rows.map((row) => row.score)) };
  },
});

// ── Public page ─────────────────────────────────────────────────────────────

const CALM = "This link isn't valid.";

export const surveyPreflight = httpAction(async (_ctx, request) =>
  preflight(request, siteOrigins()),
);

type Admitted = { cors: Record<string, string> };

/** Origin allow-list and the per-IP limit, shared by both routes. */
async function admit(
  ctx: ActionCtx,
  request: Request,
): Promise<Admitted | Response> {
  const origins = siteOrigins();
  const cors = {
    ...corsHeaders(request, origins),
    "Cache-Control": "no-store",
  };
  if (!originAllowed(request, origins)) {
    return json({ ok: false, error: "Origin not allowed" }, 403, cors);
  }
  const limited = await rateLimiter.limit(ctx, "surveyIp", {
    key: clientIp(request),
  });
  if (!limited.ok) {
    return json({ ok: false, error: "Too many requests." }, 429, {
      ...cors,
      "Retry-After": String(Math.ceil(limited.retryAfter / 1000)),
    });
  }
  return { cors };
}

/** The hash of a well-formed token that is within its own limit, else a refusal. */
async function tokenGate(
  ctx: ActionCtx,
  token: unknown,
  { cors }: Admitted,
): Promise<string | Response> {
  if (!isSurveyToken(token)) {
    return json({ ok: false, error: CALM }, 404, cors);
  }
  const tokenHash = await sha256Hex(token);
  const limited = await rateLimiter.limit(ctx, "surveyToken", {
    key: tokenHash,
  });
  if (!limited.ok) {
    return json({ ok: false, error: "Too many requests." }, 429, {
      ...cors,
      "Retry-After": String(Math.ceil(limited.retryAfter / 1000)),
    });
  }
  return tokenHash;
}

export const surveyInfo = httpAction(async (ctx, request) => {
  const admitted = await admit(ctx, request);
  if (admitted instanceof Response) return admitted;
  const { cors } = admitted;
  const tokenHash = await tokenGate(
    ctx,
    new URL(request.url).searchParams.get("token"),
    admitted,
  );
  if (tokenHash instanceof Response) return tokenHash;
  const found = await ctx.runQuery(internal.surveys.info, { tokenHash });
  if (!found) return json({ ok: false, error: CALM }, 404, cors);
  return json(found, 200, cors);
});

const REFUSALS = {
  invalid: [404, CALM],
  expired: [410, "This link has expired."],
  answered: [409, "This survey was already answered."],
} as const;

export const surveyRespond = httpAction(async (ctx, request) => {
  const admitted = await admit(ctx, request);
  if (admitted instanceof Response) return admitted;
  const { cors } = admitted;
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) {
    return json({ ok: false, error: "Send JSON" }, 415, cors);
  }
  const body = await readJson(request, BODY_LIMIT);
  if (!body.ok)
    return json({ ok: false, error: body.error }, body.status, cors);
  const { token, score, comment } = body.value;
  const tokenHash = await tokenGate(ctx, token, admitted);
  if (tokenHash instanceof Response) return tokenHash;
  if (!isScore(score)) {
    return json({ ok: false, error: "Pick a score from 0 to 10." }, 422, cors);
  }
  if (comment !== undefined && typeof comment !== "string") {
    return json({ ok: false, error: "Comment must be text." }, 422, cors);
  }
  const cleaned = comment === undefined ? undefined : cleanComment(comment);
  if ((cleaned?.length ?? 0) > COMMENT_MAX) {
    return json({ ok: false, error: "That comment is too long." }, 422, cors);
  }
  const result = await ctx.runMutation(internal.surveys.respond, {
    tokenHash,
    score,
    comment: cleaned ?? (comment === undefined ? undefined : ""),
  });
  if (result === "ok") return json({ ok: true }, 200, cors);
  const [status, error] = REFUSALS[result];
  return json({ ok: false, error, [result]: true }, status, cors);
});
