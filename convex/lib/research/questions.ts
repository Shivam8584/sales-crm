import type { MutationCtx, QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import type { ResearchQuestionKind } from "../../../lib/domain/research";
import type { Subject } from "./queue";

const MAX = 50;

export function questionsFor(ctx: QueryCtx, subject: Subject) {
  const questions = ctx.db.query("researchQuestions");
  return (
    "accountId" in subject
      ? questions.withIndex("by_account", (q) =>
          q.eq("accountId", subject.accountId),
        )
      : questions.withIndex("by_person", (q) =>
          q.eq("personId", subject.personId),
        )
  ).take(MAX);
}

/** Files a question once: a key already asked, answered or not, is never filed again. */
export async function ask(
  ctx: MutationCtx,
  subject: Subject,
  existing: Doc<"researchQuestions">[],
  question: {
    kind: ResearchQuestionKind;
    key: string;
    prompt: string;
    evidence?: string;
    options: { value: string; label: string }[];
    refPersonId?: Id<"people">;
  },
) {
  if (
    existing.some(
      (row) => row.kind === question.kind && row.key === question.key,
    )
  ) {
    return false;
  }
  await ctx.db.insert("researchQuestions", { ...subject, ...question });
  return true;
}
