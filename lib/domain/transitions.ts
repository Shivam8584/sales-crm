/**
 * The state machines for leads, deals, tasks and proposals. Each check returns
 * a problem (field and message) or null, so the server can reject an illegal
 * move and the client can explain it.
 */
import type {
  DealStage,
  DisqualifyReason,
  LeadStatus,
  TaskStatus,
} from "./enums";
import type { ProposalStatus } from "./pricing";

export type Problem = { field: string; message: string };

const CLOSED_LEAD: LeadStatus[] = ["disqualified", "converted"];

export const isLeadOpen = (status: LeadStatus) => !CLOSED_LEAD.includes(status);

/**
 * Converted is terminal and only `convert` gets there. Disqualifying needs a
 * reason. A disqualified lead can be reopened to any open status.
 */
export function leadStatusProblem(
  from: LeadStatus,
  to: LeadStatus,
  reason: DisqualifyReason | undefined,
): Problem | null {
  if (from === "converted") {
    return { field: "status", message: "This lead is already converted" };
  }
  if (to === "converted") {
    return {
      field: "status",
      message: "Use Convert to turn a lead into an account",
    };
  }
  if (to === "disqualified" && !reason) {
    return {
      field: "reason",
      message: "Pick a reason to disqualify this lead",
    };
  }
  return null;
}

export function isLeadReopen(from: LeadStatus, to: LeadStatus) {
  return from === "disqualified" && isLeadOpen(to);
}

export function leadConvertProblem(from: LeadStatus): Problem | null {
  if (from === "converted") {
    return { field: "status", message: "This lead is already converted" };
  }
  if (from === "disqualified") {
    return {
      field: "status",
      message: "Reopen this lead before converting it",
    };
  }
  return null;
}

export const isDealClosed = (stage: DealStage) =>
  stage === "won" || stage === "lost";

/**
 * Closing stamps `closedAt` (kept while the deal stays in the same closed
 * stage), reopening clears it with the lost reason, and lost needs a reason.
 */
export function dealStageEffects(
  deal: { stage: DealStage; closedAt?: number },
  stage: DealStage,
  lostReason: string | undefined,
  now: number,
):
  | { ok: true; closedAt: number | undefined; lostReason: string | undefined }
  | { ok: false; problem: Problem } {
  if (stage === "lost" && !lostReason) {
    return {
      ok: false,
      problem: { field: "lostReason", message: "Say why the deal was lost" },
    };
  }
  return {
    ok: true,
    closedAt: isDealClosed(stage)
      ? deal.stage === stage
        ? (deal.closedAt ?? now)
        : now
      : undefined,
    lostReason: stage === "lost" ? lostReason : undefined,
  };
}

/** `completedAt` follows the status: set on entering done, cleared on leaving it. */
export function taskCompletedAt(
  from: TaskStatus | null,
  to: TaskStatus,
  completedAt: number | undefined,
  now: number,
) {
  if (to !== "done") return undefined;
  return from === "done" ? (completedAt ?? now) : now;
}

const PROPOSAL_MOVES: Record<ProposalStatus, ProposalStatus[]> = {
  draft: ["sent"],
  sent: ["accepted", "rejected", "draft"],
  accepted: ["sent"],
  rejected: ["sent", "draft"],
};

/**
 * Draft → sent → accepted or rejected. Editing a sent proposal, or starting
 * over after a rejection, takes it back to draft; a decision can be undone
 * back to sent.
 */
export function proposalMoveProblem(
  from: ProposalStatus,
  to: ProposalStatus,
): Problem | null {
  if (PROPOSAL_MOVES[from].includes(to)) return null;
  const message =
    from === "draft"
      ? "Send the proposal first"
      : to === "draft"
        ? "Reopen the accepted proposal before editing it"
        : from === "sent"
          ? "This proposal is already sent"
          : "Reopen the proposal first";
  return { field: "status", message };
}
