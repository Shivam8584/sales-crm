"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { MemberStatus, Role } from "@/lib/domain/enums";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";

export type TeamMember = FunctionReturnType<typeof api.members.team>[number];

/** Role and access changes with optimistic updates and undo toasts. */
export function useMemberActions() {
  const setRoleMutation = useMutation(api.members.setRole).withOptimisticUpdate(
    (store, { id, role }) => {
      const team = store.getQuery(api.members.team, {});
      if (team) {
        store.setQuery(
          api.members.team,
          {},
          team.map((member) =>
            member._id === id ? { ...member, role } : member,
          ),
        );
      }
    },
  );
  const setStatusMutation = useMutation(
    api.members.setStatus,
  ).withOptimisticUpdate((store, { id, status }) => {
    const team = store.getQuery(api.members.team, {});
    if (team) {
      store.setQuery(
        api.members.team,
        {},
        team.map((member) =>
          member._id === id ? { ...member, status } : member,
        ),
      );
    }
  });

  async function setRole(member: TeamMember, role: Role) {
    try {
      const previous = await setRoleMutation({ id: member._id, role });
      if (previous === role) return;
      toast(
        `${member.name} is now ${article(role)} ${ROLE_LABEL[role]}`,
        () => {
          setRoleMutation({ id: member._id, role: previous }).catch((error) =>
            toast(readError(error).message, { tone: "danger" }),
          );
        },
      );
    } catch (error) {
      toast(readError(error, "Couldn't change the role").message, {
        tone: "danger",
      });
    }
  }

  async function setStatus(member: TeamMember, status: MemberStatus) {
    try {
      const previous = await setStatusMutation({ id: member._id, status });
      if (previous === status) return;
      toast(
        status === "deactivated"
          ? `Deactivated ${member.name}`
          : `Reactivated ${member.name}`,
        () => {
          setStatusMutation({ id: member._id, status: previous }).catch(
            (error) => toast(readError(error).message, { tone: "danger" }),
          );
        },
      );
    } catch (error) {
      toast(readError(error, "Couldn't update access").message, {
        tone: "danger",
      });
    }
  }

  return { setRole, setStatus };
}

function article(role: Role) {
  return role === "admin" ? "an" : "a";
}

/** Why the viewer can't change this member, or null when they can. */
export function lockReason(
  member: TeamMember,
  viewerId: TeamMember["_id"],
  team: TeamMember[],
) {
  if (member._id === viewerId)
    return "You can't change your own role or access";
  const activeAdmins = team.filter(
    (item) => item.role === "admin" && item.status === "active",
  );
  if (
    member.role === "admin" &&
    member.status === "active" &&
    activeAdmins.length <= 1
  ) {
    return "The workspace needs at least one active admin";
  }
  return null;
}
