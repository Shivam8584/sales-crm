import type { TagTone } from "@/components/_ui/tag";
import { ROLES, type Role } from "@/lib/domain/enums";
import { ROLE_LABEL } from "@/lib/domain/labels";

export const ROLE_DESCRIPTION: Record<Role, string> = {
  admin: "Full access, including inviting people and changing roles.",
  manager: "Oversees the team's accounts, deals and pipeline.",
  rep: "Works leads, accounts and deals day to day.",
};

export const ROLE_TONE: Record<Role, TagTone> = {
  admin: "purple",
  manager: "blue",
  rep: "neutral",
};

export const ROLE_OPTIONS = ROLES.map((role) => ({
  value: role,
  label: ROLE_LABEL[role],
}));
