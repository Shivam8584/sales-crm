/**
 * The automation engine. Each step runs in its own transaction, scheduled
 * through `internal.automations.run` with a step key; the enrollment stores the
 * only key allowed to run, so duplicate or stale schedules are no-ops and every
 * side effect of a step commits exactly once with the move to the next step.
 */
export { MAX_ATTEMPTS, finish, logStep, subjectOf } from "./engineState";
export {
  emitAutomationTrigger,
  enroll,
  pauseRun,
  resumeAllHeld,
  resumeHeld,
  resumeRun,
  type EnrollOutcome,
  type TriggerInput,
} from "./engineFlow";
export { runStep, stepFailed } from "./engineRun";
export { asksToStop, recordReply, type ReplyInput } from "./engineReplies";
