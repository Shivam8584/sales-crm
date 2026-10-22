import { ROLE_RANK, type Role } from "../../lib/domain/enums";
import { fail } from "./errors";

/**
 * Who may do what. Everyone reads every record: the team is small and shares
 * accounts. Details are editable by anyone; changing who owns a record, and
 * removing it, is for its owner or a manager. Team, settings and privacy are
 * admin-only; pricing approval is for managers.
 */
export type Rule = {
  /** The lowest role allowed on any record. */
  min: Role;
  /** Reps (below `min`) may still act on records they own or are assigned. */
  own?: boolean;
};

export const PERMISSIONS = {
  "record.read": { min: "rep" },
  "record.create": { min: "rep" },
  "record.edit": { min: "rep" },
  "record.import": { min: "rep" },
  "record.export": { min: "manager" },
  "record.merge": { min: "manager" },
  "record.restore": { min: "manager" },

  "account.reassign": { min: "manager", own: true },
  "account.archive": { min: "manager", own: true },
  "person.reassign": { min: "manager", own: true },
  "person.archive": { min: "manager", own: true },
  "lead.reassign": { min: "manager", own: true },
  "deal.reassign": { min: "manager", own: true },
  "deal.delete": { min: "manager", own: true },
  "task.reassign": { min: "manager", own: true },
  "task.delete": { min: "manager", own: true },
  "timeline.edit": { min: "admin", own: true },

  "activation.task": { min: "manager", own: true },
  "proposal.approve": { min: "manager" },
  "activation.run": { min: "manager" },
  "sequence.run": { min: "manager", own: true },
  "report.send": { min: "manager", own: true },

  "member.manage": { min: "admin" },
  "invite.manage": { min: "admin" },
  "settings.write": { min: "admin" },
  "integrations.read": { min: "admin" },
  "privacy.erase": { min: "admin" },
  "privacy.retention": { min: "admin" },
} as const satisfies Record<string, Rule>;

export type Action = keyof typeof PERMISSIONS;

export type Actor = { _id: string; role: Role };

/** `owners` are the record's owner or assignee ids; unowned records count as nobody's. */
export function can(
  actor: Actor,
  action: Action,
  owners: readonly (string | null | undefined)[] = [],
) {
  const rule: Rule = PERMISSIONS[action];
  if (ROLE_RANK[actor.role] >= ROLE_RANK[rule.min]) return true;
  return Boolean(rule.own) && owners.some((owner) => owner === actor._id);
}

const DENIED: Partial<Record<Action, string>> = {
  "account.reassign": "Only the owner or a manager can reassign this account",
  "account.archive": "Only the owner or a manager can archive this account",
  "person.reassign": "Only the owner or a manager can reassign this person",
  "person.archive": "Only the owner or a manager can archive this person",
  "lead.reassign": "Only the owner or a manager can reassign this lead",
  "deal.reassign": "Only the owner or a manager can reassign this deal",
  "deal.delete": "Only the owner or a manager can delete this deal",
  "task.reassign": "Only the assignee or a manager can reassign this task",
  "task.delete": "Only the assignee or a manager can delete this task",
  "timeline.edit": "Only the author or an admin can change this",
  "proposal.approve": "Only a manager or an admin can decide on pricing",
  "sequence.run":
    "Reps can only start, pause and enrol records in their own sequences",
  "report.send": "Only the owner or a manager can email this report",
};

export function assertCan(
  actor: Actor,
  action: Action,
  owners: readonly (string | null | undefined)[] = [],
) {
  if (!can(actor, action, owners)) {
    fail("forbidden", DENIED[action] ?? "You don't have permission to do that");
  }
}

/**
 * Reps may claim an unowned lead for themselves and hand on leads they own;
 * managers assign anything.
 */
export function canAssignLead(
  actor: Actor,
  currentOwner: string | null | undefined,
  nextOwner: string | null,
) {
  if (can(actor, "lead.reassign")) return true;
  if (currentOwner === actor._id) return true;
  return !currentOwner && nextOwner === actor._id;
}

export function assertCanAssignLead(
  actor: Actor,
  currentOwner: string | null | undefined,
  nextOwner: string | null,
) {
  if (!canAssignLead(actor, currentOwner, nextOwner)) {
    fail("forbidden", DENIED["lead.reassign"]!);
  }
}

/** Approvers can't sign off their own request, unless they are an admin. */
export function canDecideApproval(
  actor: Actor,
  requestedById: string | null | undefined,
) {
  if (!can(actor, "proposal.approve")) return false;
  return actor.role === "admin" || requestedById !== actor._id;
}
