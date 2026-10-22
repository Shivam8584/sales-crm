import type { MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import {
  isLive,
  matchesTrigger,
  subjectKey,
  type TriggerEvent,
} from "../../../lib/domain/automations";
import { appendLedger } from "../consent";
import { logSystem, type RecordRefs } from "../timeline";
import { DAY, finish, logStep } from "./engineState";
import { emitAutomationTrigger, subjectKeys } from "./engineFlow";

// ── Replies ─────────────────────────────────────────────────────────────────

/** A reply this soon after a run ended still counts towards its reply rate. */
const REPLY_GRACE_MS = 14 * DAY;

const CHANNEL_WORD = { email: "email", whatsapp: "WhatsApp" } as const;

export type ReplyInput = {
  refs: RecordRefs;
  channel: "email" | "whatsapp";
  at: number;
  dealIds?: Id<"deals">[];
  text?: string;
};

const STOP_PHRASE =
  /\b(unsubscribe|opt[\s-]?out|remove me|stop (emailing|sending|contacting)|band kar(o|do|\s+do)|mat bhej(o|na))\b/i;
const STOP_ALONE = /^\W*(please\s+)?stop\W*$/i;
const NEGATED =
  /\b(don['’]?t|do not|never|won['’]?t|not)\s+(\w+\s+){0,2}(unsubscribe|opt[\s-]?out|remove me|stop)|\b(unsubscribe|band)\s+(\w+\s+)?(mat|nahi|na)\s+kar|\b(mat|na)\s+band\s+kar/i;
/** JS word boundaries ignore Devanagari, so the end of a word is checked by hand. */
const STOP_HINDI =
  /(बंद\s+कर(ो|\s*दो|\s*दीजिए)|मत\s+भेज(ो|ना|िए|ें))(?![\p{L}\p{M}])/u;
const NEGATED_HINDI =
  /(मत|न)\s+बंद\s+कर|(बंद|unsubscribe)\s+(\S+\s+)?(मत|नहीं)\s+कर/iu;

/** Only a short first line counts, so a long reply that merely mentions the word isn't an opt-out. */
export function asksToStop(text: string) {
  const first =
    text
      .normalize("NFC")
      .split("\n")
      .find((line) => line.trim() && !line.trimStart().startsWith(">"))
      ?.trim() ?? "";
  return (
    first.length <= 60 &&
    !NEGATED.test(first) &&
    !NEGATED_HINDI.test(first) &&
    (STOP_PHRASE.test(first) ||
      STOP_HINDI.test(first) ||
      STOP_ALONE.test(first))
  );
}

async function withdrawConsent(ctx: MutationCtx, input: ReplyInput) {
  const { personId, leadId } = input.refs;
  if (!personId && !leadId) return;
  await appendLedger(ctx, {
    personId,
    leadId: personId ? undefined : leadId,
    channels: [input.channel],
    event: "withdraw",
    source: input.channel,
    text: "Asked to unsubscribe by replying to an automated message",
  });
  await logSystem(
    ctx,
    input.refs,
    `unsubscribed from ${CHANNEL_WORD[input.channel]} by reply`,
  );
}

/**
 * A contact replied: their runs are marked replied, live runs that stop on
 * reply exit (unless a step is waiting for exactly this reply), and reply
 * triggers and waits fire.
 */
export async function recordReply(ctx: MutationCtx, input: ReplyInput) {
  const event: TriggerEvent = {
    kind: "reply_received",
    refs: input.refs,
    value: input.channel,
    at: input.at,
  };
  const keys = [
    ...subjectKeys(input.refs),
    ...(input.dealIds ?? []).map((id) => subjectKey("deal", id)),
  ];
  const unsubscribed = input.text ? asksToStop(input.text) : false;
  if (unsubscribed) await withdrawConsent(ctx, input);
  let exited = 0;
  let marked = 0;
  const statuses = [
    "running",
    "waiting",
    "completed",
    "exited",
    "failed",
  ] as const;
  for (const key of new Set(keys)) {
    for (const status of statuses) {
      const rows = await ctx.db
        .query("automationEnrollments")
        .withIndex("by_subject", (q) =>
          q.eq("subjectKey", key).eq("status", status),
        )
        .collect();
      for (const enrollment of rows) {
        const live = isLive(enrollment.status);
        if (!live && (enrollment.finishedAt ?? 0) < input.at - REPLY_GRACE_MS) {
          continue;
        }
        if (!enrollment.repliedAt) {
          await ctx.db.patch(enrollment._id, { repliedAt: input.at });
          marked++;
        }
        if (!live) continue;
        const awaited =
          enrollment.waitingFor && matchesTrigger(enrollment.waitingFor, event);
        const automation = await ctx.db.get(enrollment.automationId);
        const stops = automation?.published?.settings.stopOnReply ?? false;
        if ((stops || unsubscribed) && (!awaited || unsubscribed)) {
          await finish(
            ctx,
            { ...enrollment, repliedAt: enrollment.repliedAt ?? input.at },
            "exited",
            unsubscribed
              ? "They asked to unsubscribe"
              : `They replied by ${CHANNEL_WORD[input.channel]}`,
            undefined,
            "replied",
          );
          exited++;
        } else if (!awaited) {
          await logStep(
            ctx,
            enrollment,
            "info",
            `They replied by ${CHANNEL_WORD[input.channel]}; the run carries on because “stop when they engage” is off`,
            enrollment.currentNodeId,
          );
        }
      }
    }
  }
  await emitAutomationTrigger(ctx, {
    kind: "reply_received",
    refs: input.refs,
    value: input.channel,
  });
  return { exited, marked };
}
