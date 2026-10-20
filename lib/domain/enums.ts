/**
 * Domain vocabularies shared by the Convex backend and the client.
 * Convex validators are derived from these lists, so adding a value here is the
 * only change needed to accept it everywhere.
 */

export const ROLES = ["admin", "manager", "rep"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_RANK: Record<Role, number> = { rep: 0, manager: 1, admin: 2 };

export const MEMBER_STATUSES = ["active", "deactivated"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/** Where an account sits in the journey from prospect to activated brand. */
export const LIFECYCLE_STAGES = [
  "prospect",
  "lead",
  "qualified",
  "demo",
  "signed_up",
  "org_created",
  "gst_verified",
  "funded",
  "live",
  "activated",
  "expanding",
  "at_risk",
  "dormant",
  "disqualified",
] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export const LEAD_KINDS = ["demo", "contact", "signup", "manual"] as const;
export type LeadKind = (typeof LEAD_KINDS)[number];

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "nurture",
  "disqualified",
  "converted",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const DISQUALIFY_REASONS = [
  "no_gst",
  "budget",
  "chose_agency",
  "marketplace_policy",
  "timing",
  "no_response",
  "spam",
] as const;
export type DisqualifyReason = (typeof DISQUALIFY_REASONS)[number];

export const DEAL_STAGES = [
  "discovery",
  "demo",
  "proposal",
  "onboarding",
  "won",
  "lost",
] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TIMELINE_KINDS = [
  "note",
  "call",
  "email",
  "meeting",
  "whatsapp",
  "change",
  "system",
] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];

export const CALL_OUTCOMES = [
  "connected",
  "no_answer",
  "busy",
  "wrong_number",
  "voicemail",
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const CHANNELS = ["email", "phone", "whatsapp"] as const;
export type Channel = (typeof CHANNELS)[number];

export const FACT_STATUSES = [
  "applied",
  "suggested",
  "accepted",
  "rejected",
  "superseded",
] as const;
export type FactStatus = (typeof FACT_STATUSES)[number];

export const RUN_STATUSES = ["running", "succeeded", "failed"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
