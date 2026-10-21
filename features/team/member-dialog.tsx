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
import Tag from "@/components/_ui/tag";
import { Properties, Property } from "@/components/record";
import { type Role } from "@/lib/domain/enums";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { StatusTag } from "./members-table";
import { ROLE_DESCRIPTION, ROLE_OPTIONS, ROLE_TONE } from "./roles";
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
              <Avatar name={member.name} size="xl" />
              <div className="flex min-w-0 flex-col gap-1.5">
                <DialogTitle className="truncate">{member.name}</DialogTitle>
                <DialogDescription className="truncate">
                  {member.email}
                </DialogDescription>
              </div>
            </DialogHeader>
            <div className="flex flex-col gap-4 px-6 py-5">
              <Properties>
                <Property label="Status">
                  <StatusTag status={member.status} />
                </Property>
                <Property label="Joined">
                  <span className="text-sm">{shortDate(member.joinedAt)}</span>
                </Property>
                {!editable && (
                  <Property label="Role">
                    <Tag tone={ROLE_TONE[member.role]} size="sm">
                      {ROLE_LABEL[member.role]}
                    </Tag>
                  </Property>
                )}
              </Properties>
              {editable && (
                <div className="flex flex-col gap-2">
                  <span
                    id="member-role-label"
                    className="caption-style text-fg-secondary"
                  >
                    Role
                  </span>
                  <div
                    role="group"
                    aria-labelledby="member-role-label"
                    className="flex flex-wrap gap-1.5"
                  >
                    {ROLE_OPTIONS.map((option) => {
                      const checked = member.role === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={checked}
                          onClick={() =>
                            void setRole(member, option.value as Role)
                          }
                          className={cn(
                            "focus-visible:ring-ring duration-fast ease-power3-out flex h-8 items-center rounded-full border px-3 text-xs leading-none font-medium transition-[background-color,border-color,color] outline-none focus-visible:ring-2",
                            checked
                              ? "border-selected bg-overlay-1 text-foreground"
                              : "border-input text-fg-secondary hover:bg-overlay-1 hover:text-foreground",
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <p className="caption-style text-fg-tertiary leading-snug">
                {ROLE_DESCRIPTION[member.role]}
              </p>
            </div>
            {isAdmin && (
              <DialogFooter className="justify-between">
                <span className="caption-style text-fg-tertiary leading-snug">
                  {locked ?? ""}
                </span>
                {member.status === "active" ? (
                  <Button
                    variant="secondary"
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
