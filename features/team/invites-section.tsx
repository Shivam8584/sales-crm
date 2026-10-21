"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/_ui/dropdown-menu";
import EmptyState from "@/components/_ui/empty-state";
import Skeleton from "@/components/_ui/skeleton";
import Tag from "@/components/_ui/tag";
import Tooltip from "@/components/_ui/tooltip";
import { PageStatus } from "@/components/shell/page";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { readError } from "@/lib/errors";
import { dateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import DotsIcon from "@/public/assets/icons/dots-horizontal.svg";
import MailIcon from "@/public/assets/icons/mail.svg";
import UserPlusIcon from "@/public/assets/icons/user-plus.svg";
import { copyText, inviteUrl } from "./invite-link";
import { ROLE_TONE } from "./roles";

export type Invite = FunctionReturnType<typeof api.invites.list>[number];

const GRID =
  "grid grid-cols-[minmax(13rem,2fr)_7.5rem_minmax(13rem,1fr)_9rem] min-[1000px]:grid-cols-[minmax(13rem,2fr)_7.5rem_minmax(9rem,1fr)_minmax(13rem,1fr)_9rem] [&>*]:px-3 [&>*:first-child]:pl-4 [&>*:last-child]:pr-2.5";
const WIDE_ONLY = "max-[999px]:hidden";

const STATUS = {
  pending: { tone: "info", label: "Pending" },
  expired: { tone: "warning", label: "Expired" },
  accepted: { tone: "success", label: "Joined" },
  revoked: { tone: "neutral", label: "Revoked" },
} as const;

function statusTime(invite: Invite) {
  switch (invite.status) {
    case "pending":
      return {
        at: invite.expiresAt,
        text: `expires ${relativeTime(invite.expiresAt)}`,
      };
    case "expired":
      return { at: invite.expiresAt, text: relativeTime(invite.expiresAt) };
    case "accepted":
      return { at: invite.acceptedAt!, text: relativeTime(invite.acceptedAt!) };
    case "revoked":
      return { at: invite.revokedAt!, text: relativeTime(invite.revokedAt!) };
  }
}

/** Open invites first, then the last two weeks of accepted and revoked ones, laid out like the members table. */
export default function InvitesSection({
  invites,
  links,
  onLink,
  onInvite,
}: {
  invites: Invite[] | undefined;
  links: Record<string, string>;
  onLink: (id: Id<"invites">, url: string) => void;
  onInvite: () => void;
}) {
  const resend = useMutation(api.invites.resend);
  const revoke = useMutation(api.invites.revoke);
  const restore = useMutation(api.invites.restore);

  const isOpen = (invite: Invite) =>
    invite.status === "pending" || invite.status === "expired";
  const rows = invites && [
    ...invites.filter(isOpen),
    ...invites.filter((invite) => !isOpen(invite)),
  ];
  const count = (status: Invite["status"]) =>
    invites?.filter((invite) => invite.status === status).length ?? 0;

  async function handleResend(invite: Invite) {
    try {
      const result = await resend({ id: invite._id });
      const url = inviteUrl(result.token);
      onLink(invite._id, url);
      const copied = await copyText(url);
      toast(
        copied
          ? `New link for ${invite.email} copied. The old link no longer works.`
          : `New link for ${invite.email} is ready to copy`,
      );
    } catch (error) {
      toast(readError(error, "Couldn't resend the invite").message, {
        tone: "danger",
      });
    }
  }

  async function handleRevoke(invite: Invite) {
    try {
      await revoke({ id: invite._id });
      toast(`Revoked the invite for ${invite.email}`, () => {
        restore({ id: invite._id }).catch((error) =>
          toast(readError(error).message, { tone: "danger" }),
        );
      });
    } catch (error) {
      toast(readError(error, "Couldn't revoke the invite").message, {
        tone: "danger",
      });
    }
  }

  async function handleCopy(invite: Invite) {
    const copied = await copyText(links[invite._id]);
    toast(
      copied
        ? "Invite link copied"
        : "Couldn't copy. Resend to get a new link.",
    );
  }

  if (rows && rows.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center overflow-auto pb-[8vh]">
        <EmptyState
          icon={MailIcon}
          title="No invites yet"
          description="Invite teammates to send them a sign-up link with the right role."
          action={
            <Button variant="primary" size="sm" onClick={onInvite}>
              <UserPlusIcon aria-hidden className="size-3" />
              Invite
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scrollbar-none min-h-0 flex-1 overflow-auto">
        <div
          aria-hidden
          className={cn(
            GRID,
            "caption-style text-fg-tertiary border-border bg-background z-sticky-header h-row sticky top-0 items-center border-b max-sm:hidden",
          )}
        >
          <span>Email</span>
          <span>Role</span>
          <span className={WIDE_ONLY}>Invited by</span>
          <span>Status</span>
          <span className="sr-only">Actions</span>
        </div>
        <ul aria-label="Invites" aria-busy={!rows || undefined}>
          {!rows &&
            Array.from({ length: 3 }, (_, index) => (
              <li
                key={index}
                aria-hidden
                className="border-border h-row flex items-center gap-3 border-b px-4"
              >
                <Skeleton className="size-5 rounded-full" />
                <Skeleton className="h-3 w-48" />
                <Skeleton className="ml-auto h-3 w-16" />
              </li>
            ))}
          {rows?.map((invite) => (
            <InviteRow
              key={invite._id}
              invite={invite}
              link={links[invite._id]}
              onCopy={() => void handleCopy(invite)}
              onResend={() => void handleResend(invite)}
              onRevoke={() => void handleRevoke(invite)}
            />
          ))}
        </ul>
      </div>
      <div
        role="group"
        aria-label="Invite totals"
        className="caption-style border-border bg-background grid shrink-0 grid-cols-2 gap-px overflow-hidden border-t sm:grid-cols-4"
      >
        {[
          { label: "Pending", value: count("pending") },
          { label: "Expired", value: count("expired") },
          { label: "Joined in 14 days", value: count("accepted") },
          { label: "Revoked in 14 days", value: count("revoked") },
        ].map((stat) => (
          <div
            key={stat.label}
            className="outline-border flex min-w-0 items-center gap-2 px-4 py-3 outline-1"
          >
            {invites ? (
              <span className="text-foreground shrink-0 tabular-nums">
                {stat.value}
              </span>
            ) : (
              <Skeleton className="h-3 w-6" />
            )}
            <span className="text-fg-tertiary truncate">{stat.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InviteRow({
  invite,
  link,
  onCopy,
  onResend,
  onRevoke,
}: {
  invite: Invite;
  link: string | undefined;
  onCopy: () => void;
  onResend: () => void;
  onRevoke: () => void;
}) {
  const isOpen = invite.status === "pending" || invite.status === "expired";
  const canCopy = invite.status === "pending" && link;
  const { tone, label } = STATUS[invite.status];
  const time = statusTime(invite);

  const actions = isOpen && (
    <>
      <Button
        variant="secondary"
        size="xs"
        onClick={canCopy ? onCopy : onResend}
      >
        {canCopy ? "Copy link" : "Resend"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`More actions for ${invite.email}`}
            className="data-[state=open]:bg-overlay-2 data-[state=open]:text-foreground"
          >
            <DotsIcon aria-hidden className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {canCopy && (
            <DropdownMenuItem onSelect={onResend}>
              Resend with a new link
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={onRevoke} className="text-danger">
            Revoke invite
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  const status = (
    <span className="flex min-w-0 items-center gap-2">
      <PageStatus tone={tone}>{label}</PageStatus>
      <Tooltip content={dateTime(time.at)}>
        <span className="caption-style text-fg-tertiary truncate">
          {time.text}
        </span>
      </Tooltip>
    </span>
  );

  const email = (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="bg-muted shadow-hairline flex size-5 shrink-0 items-center justify-center rounded-full">
        <MailIcon aria-hidden className="text-fg-secondary size-3" />
      </span>
      <span
        title={invite.email}
        className={cn("truncate", isOpen ? "font-medium" : "text-fg-tertiary")}
      >
        {invite.email}
      </span>
    </span>
  );

  return (
    <li className="border-border hover:bg-row-hover duration-fast border-b transition-colors">
      <div className={cn(GRID, "lead-style h-row items-center max-sm:hidden")}>
        {email}
        <span className="flex min-w-0">
          <Tag tone={ROLE_TONE[invite.role]} size="sm">
            {ROLE_LABEL[invite.role]}
          </Tag>
        </span>
        <span className={cn("flex min-w-0 items-center gap-2", WIDE_ONLY)}>
          {invite.invitedBy ? (
            <>
              <Avatar name={invite.invitedBy} size="xs" />
              <span className="text-fg-secondary truncate">
                {invite.invitedBy}
              </span>
            </>
          ) : (
            <span className="text-fg-tertiary">–</span>
          )}
        </span>
        {status}
        <span className="flex items-center justify-end gap-1">{actions}</span>
      </div>
      <div className="flex flex-col gap-2.5 px-4 py-3.5 sm:hidden">
        <span className="lead-style flex items-center gap-3">
          <span className="min-w-0 flex-1">{email}</span>
          <Tag tone={ROLE_TONE[invite.role]} size="xs">
            {ROLE_LABEL[invite.role]}
          </Tag>
        </span>
        <span className="flex items-center justify-between gap-2 pl-7.5">
          {status}
          <span className="flex shrink-0 items-center gap-1">{actions}</span>
        </span>
      </div>
    </li>
  );
}
