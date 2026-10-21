import type {
  CallOutcome,
  DealStage,
  DisqualifyReason,
  LeadKind,
  LeadStatus,
  LifecycleStage,
  Priority,
  Role,
  TaskStatus,
} from "./enums";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  manager: "Manager",
  rep: "Rep",
};

export const STAGE_LABEL: Record<LifecycleStage, string> = {
  prospect: "Prospect",
  lead: "Lead",
  qualified: "Qualified",
  demo: "Demo",
  signed_up: "Signed up",
  org_created: "Org created",
  gst_verified: "GST verified",
  funded: "Funded",
  live: "Live",
  activated: "Activated",
  expanding: "Expanding",
  at_risk: "At risk",
  dormant: "Dormant",
  disqualified: "Disqualified",
};

export const LEAD_KIND_LABEL: Record<LeadKind, string> = {
  demo: "Demo request",
  contact: "Contact form",
  signup: "Platform signup",
  manual: "Added manually",
};

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  nurture: "Nurture",
  disqualified: "Disqualified",
  converted: "Converted",
};

export const DISQUALIFY_REASON_LABEL: Record<DisqualifyReason, string> = {
  no_gst: "No GST",
  budget: "Budget",
  chose_agency: "Chose an agency",
  marketplace_policy: "Marketplace policy concern",
  timing: "Timing",
  no_response: "No response",
  spam: "Spam",
};

export const DEAL_STAGE_LABEL: Record<DealStage, string> = {
  discovery: "Discovery",
  demo: "Demo",
  proposal: "Proposal",
  onboarding: "Onboarding",
  won: "Won",
  lost: "Lost",
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};

export const CALL_OUTCOME_LABEL: Record<CallOutcome, string> = {
  connected: "Connected",
  no_answer: "No answer",
  busy: "Busy",
  wrong_number: "Wrong number",
  voicemail: "Voicemail",
};

export function personName(person: { firstName: string; lastName: string }) {
  return `${person.firstName} ${person.lastName}`.trim();
}
