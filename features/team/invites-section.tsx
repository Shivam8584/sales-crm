"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/_ui/dropdown-menu";
import Skeleton from "@/components/_ui/skeleton";
import Tag from "@/components/_ui/tag";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { readError } from "@/lib/errors";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import DotsIcon from "@/public/assets/icons/dots-horizontal.svg";
import MailIcon from "@/public/assets/icons/mail.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import { copyText, inviteUrl } from "./invite-link";

type Invite = FunctionReturnType<typeof api.invites.list>[number];

/** Leading tracks match the members table so Email, Invited by and Role line up with Name, Email and Role. */
const GRID =
  "sm:grid sm:grid-cols-[minmax(13rem,2fr)_minmax(12rem,2fr)_8.5rem_11.5rem_7.5rem] sm:items-center sm:[&>*]:px-3 sm:[&>*:first-child]:pl-4";

/** Open invites first, then the last two weeks of accepted and revoked ones. */
export default function InvitesSection({
  links,
  onLink,
  onInvite,
}: {
  links: Record<string, string>;
  onLink: (id: Id<"invites">, url: string) => void;
  onInvite: () => void;
}) {
  const invites = useQuery(api.invites.list, {});
  const resend = useMutation(api.invites.resend);
  const revoke = useMutation(api.invites.revoke);
  const restore = useMutation(api.invites.restore);

  const open = invites?.filter(
    (invite) => invite.status === "pending" || invite.status === "expired",
  );
  const closed = invites?.filter(
    (invite) => invite.status === "accepted" || invite.status === "revoked",
  );

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

  return (
    <section aria-labelledby="invites-heading" className="pt-10">
      <div className="flex items-center gap-2 pb-3">
        <h3 id="invites-heading">Invites</h3>
        {open && open.length > 0 && (
          <span className="caption-style text-fg-tertiary tabular-nums">
            {open.length} open
          </span>
        )}
      </div>

      {!invites ? (
        <div className="border-border overflow-hidden rounded-xl border">
          {Array.from({ length: 2 }, (_, index) => (
            <div
              key={index}
              className="border-border flex h-12 items-center gap-3 px-4 not-last:border-b"
            >
              <Skeleton className="h-3 w-48" />
              <Skeleton className="ml-auto h-3 w-16" />
            </div>
          ))}
        </div>
      ) : invites.length === 0 ? (
        <div className="border-border flex flex-wrap items-center gap-3 rounded-xl border px-4 py-4">
          <p className="caption-style text-fg-tertiary flex-1 leading-snug">
            No open invites. Invite teammates to give them a sign-up link with
            the right role.
          </p>
          <Button variant="subtle" size="xs" onClick={onInvite}>
            <PlusIcon aria-hidden className="size-3" />
            Invite
          </Button>
        </div>
      ) : (
        <div className="border-border overflow-hidden rounded-xl border">
          <div
            aria-hidden
            className={cn(
              GRID,
              "caption-style text-fg-tertiary border-border hidden h-9 border-b",
            )}
          >
            <span>Email</span>
            <span>Invited by</span>
            <span>Role</span>
            <span>Status</span>
            <span />
          </div>
          <ul aria-label="Invites">
            {[...(open ?? []), ...(closed ?? [])].map((invite) => (
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
      )}
    </section>
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

  const actions = isOpen && (
    <>
      {canCopy ? (
        <Button variant="subtle" size="xs" onClick={onCopy}>
          Copy link
        </Button>
      ) : (
        <Button variant="subtle" size="xs" onClick={onResend}>
          Resend
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`More actions for ${invite.email}`}
          >
            <DotsIcon aria-hidden className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
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

  return (
    <li
      className={cn(
        GRID,
        "border-border lead-style flex items-center gap-3 px-4 py-3 not-last:border-b sm:h-11 sm:gap-0 sm:p-0",
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="bg-muted shadow-hairline flex size-7 shrink-0 items-center justify-center rounded-full">
          <MailIcon aria-hidden className="text-fg-secondary size-3.5" />
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className={cn("truncate", !isOpen && "text-fg-tertiary")}>
            {invite.email}
          </span>
          <span className="caption-style text-fg-tertiary truncate sm:hidden">
            {ROLE_LABEL[invite.role]} · <InviteStatus invite={invite} plain />
          </span>
        </span>
      </span>
      <span className="text-fg-secondary truncate max-sm:hidden">
        {invite.invitedBy ?? "—"}
      </span>
      <span className="text-fg-secondary max-sm:hidden">
        {ROLE_LABEL[invite.role]}
      </span>
      <span className="min-w-0 max-sm:hidden">
        <InviteStatus invite={invite} />
      </span>
      <span className="flex shrink-0 items-center justify-end gap-1">
        {actions}
      </span>
    </li>
  );
}

const STATUS_TAG = {
  expired: { tone: "amber", label: "Expired" },
  accepted: { tone: "green", label: "Joined" },
  revoked: { tone: "neutral", label: "Revoked" },
} as const;

function InviteStatus({ invite, plain }: { invite: Invite; plain?: boolean }) {
  if (invite.status === "pending") {
    const text = `Expires ${relativeTime(invite.expiresAt)}`;
    return plain ? text : <span className="text-fg-secondary">{text}</span>;
  }
  const at =
    invite.status === "accepted"
      ? invite.acceptedAt!
      : invite.status === "revoked"
        ? invite.revokedAt!
        : invite.expiresAt;
  const { tone, label } = STATUS_TAG[invite.status];
  if (plain) return `${label} ${relativeTime(at)}`;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Tag tone={tone} size="sm">
        {label}
      </Tag>
      <span className="caption-style text-fg-tertiary truncate">
        {relativeTime(at)}
      </span>
    </span>
  );
}
