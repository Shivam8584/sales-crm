"use client";

import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/_ui/dialog";
import { type Role } from "@/lib/domain/enums";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { StatusTag } from "./members-table";
import { ROLE_DESCRIPTION, ROLE_OPTIONS } from "./roles";
import {
  lockReason,
  useMemberActions,
  type TeamMember,
} from "./use-member-actions";

/** A member's details; admins can change role and access here, which is the only way on phones. */
export default function MemberDialog({
  member,
  team,
  viewerId,
  isAdmin,
  onOpenChange,
}: {
  member: TeamMember | undefined;
  team: TeamMember[];
  viewerId: TeamMember["_id"];
  isAdmin: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { setRole, setStatus } = useMemberActions();
  const locked = member ? lockReason(member, viewerId, team) : null;
  const editable = isAdmin && !locked;

  return (
    <Dialog open={!!member} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-100">
        {member && (
          <>
            <DialogHeader className="flex-row items-center gap-3 pr-14">
              <Avatar name={member.name} size="lg" />
              <div className="flex min-w-0 flex-col gap-1.5">
                <DialogTitle className="truncate">{member.name}</DialogTitle>
                <DialogDescription className="truncate">
                  {member.email}
                </DialogDescription>
              </div>
            </DialogHeader>
            <dl className="grid grid-cols-[6rem_1fr] items-center gap-x-4 gap-y-3 px-6 py-5 text-sm">
              <dt className="text-fg-tertiary">Status</dt>
              <dd>
                <StatusTag status={member.status} />
              </dd>
              <dt className="text-fg-tertiary">Joined</dt>
              <dd>{shortDate(member.joinedAt)}</dd>
              <dt className="text-fg-tertiary self-start pt-1.5">Role</dt>
              <dd className="flex flex-col gap-1.5">
                {editable ? (
                  <div
                    role="group"
                    aria-label={`Role for ${member.name}`}
                    className="bg-muted flex rounded-lg p-0.5"
                  >
                    {ROLE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={member.role === option.value}
                        onClick={() =>
                          void setRole(member, option.value as Role)
                        }
                        className={cn(
                          "focus-visible:ring-ring duration-fast h-7 flex-1 rounded-md text-xs font-medium transition-colors outline-none focus-visible:ring-2",
                          member.role === option.value
                            ? "bg-card text-foreground shadow-raised"
                            : "text-fg-secondary hover:text-foreground",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="pt-1.5">{ROLE_LABEL[member.role]}</span>
                )}
                <span className="caption-style text-fg-tertiary leading-snug">
                  {ROLE_DESCRIPTION[member.role]}
                </span>
              </dd>
            </dl>
            {isAdmin && (
              <DialogFooter className="justify-between">
                <span className="caption-style text-fg-tertiary leading-snug">
                  {locked ?? ""}
                </span>
                {member.status === "active" ? (
                  <Button
                    variant="subtle"
                    size="sm"
                    disabled={!!locked}
                    className="text-danger"
                    onClick={() => void setStatus(member, "deactivated")}
                  >
                    Deactivate
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!!locked}
                    onClick={() => void setStatus(member, "active")}
                  >
                    Reactivate
                  </Button>
                )}
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
