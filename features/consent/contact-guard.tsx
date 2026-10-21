"use client";

import { useState, type ComponentType, type SVGProps } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button, { buttonVariants } from "@/components/_ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/_ui/dialog";
import Tooltip from "@/components/_ui/tooltip";
import { whatsappHref } from "@/features/people/contact-actions";
import type { ContactDecision } from "@/lib/domain/consent";
import type { Channel } from "@/lib/domain/enums";
import { readError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import AlertTriangleIcon from "@/public/assets/icons/alert-triangle.svg";
import MailIcon from "@/public/assets/icons/mail-04.svg";
import MessageIcon from "@/public/assets/icons/message.svg";
import PhoneIcon from "@/public/assets/icons/phone.svg";

type Action = {
  channel: Channel;
  label: string;
  verb: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  href: string;
  external: boolean;
};

function actionsFor(person: { email: string | null; phone: string | null }) {
  const actions: Action[] = [];
  if (person.phone) {
    actions.push({
      channel: "phone",
      label: "Call",
      verb: "Call",
      icon: PhoneIcon,
      href: `tel:${person.phone}`,
      external: false,
    });
  }
  if (person.email) {
    actions.push({
      channel: "email",
      label: "Email",
      verb: "Email",
      icon: MailIcon,
      href: `mailto:${person.email}`,
      external: false,
    });
  }
  if (person.phone) {
    actions.push({
      channel: "whatsapp",
      label: "WhatsApp",
      verb: "Message",
      icon: MessageIcon,
      href: whatsappHref(person.phone),
      external: true,
    });
  }
  return actions;
}

function open(action: Action) {
  if (action.external)
    window.open(action.href, "_blank", "noopener,noreferrer");
  else window.location.href = action.href;
}

/**
 * Call, email and WhatsApp shortcuts behind the consent gate. Allowed channels
 * act at once; blocked ones explain why and need a confirmation that is logged.
 */
export default function GuardedContactActions({
  person,
  className,
}: {
  person: { _id: Id<"people">; email: string | null; phone: string | null };
  className?: string;
}) {
  const matrix = useQuery(api.consents.forPerson, { personId: person._id });
  const logOverride = useMutation(api.consents.logOverride);
  const [pending, setPending] = useState<{
    action: Action;
    decision: ContactDecision;
  } | null>(null);

  const actions = actionsFor(person);
  if (actions.length === 0) return null;

  const decisionFor = (channel: Channel) =>
    matrix?.channels.find((row) => row.channel === channel)?.decisions
      .sales_outreach;

  function confirm() {
    if (!pending) return;
    open(pending.action);
    logOverride({
      personId: person._id,
      channel: pending.action.channel,
    }).catch((error) => toast(readError(error).message, { tone: "danger" }));
    setPending(null);
  }

  const name = matrix?.name ?? "them";
  const target = pending?.action;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {actions.map((action) => {
        const decision = decisionFor(action.channel);
        const Icon = action.icon;
        if (decision?.allowed) {
          return (
            <a
              key={action.channel}
              href={action.href}
              {...(action.external
                ? { target: "_blank", rel: "noreferrer" }
                : {})}
              className={buttonVariants({ variant: "subtle", size: "xs" })}
            >
              <Icon aria-hidden className="size-3" />
              {action.label}
            </a>
          );
        }
        return (
          <Tooltip
            key={action.channel}
            content={
              decision
                ? `${decision.message}. Click to confirm.`
                : "Checking consent…"
            }
          >
            <Button
              variant="subtle"
              size="xs"
              aria-disabled={!decision || undefined}
              aria-label={
                decision ? `${action.label}: ${decision.message}` : action.label
              }
              onClick={() => decision && setPending({ action, decision })}
              className={cn(!decision && "opacity-60")}
            >
              <Icon aria-hidden className="size-3" />
              {action.label}
              {decision && (
                <AlertTriangleIcon
                  aria-hidden
                  className="text-warning -mr-0.5 size-3"
                />
              )}
            </Button>
          </Tooltip>
        );
      })}
      <Dialog
        open={pending !== null}
        onOpenChange={(value) => !value && setPending(null)}
      >
        <DialogContent className="max-w-104">
          {pending && target && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {target.verb} {name} anyway?
                </DialogTitle>
                <DialogDescription>
                  {pending.decision.message}.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3 px-6 py-5 text-sm leading-snug">
                <p className="text-fg-secondary">
                  {target.channel === "phone" &&
                  pending.decision.reason === "dnd"
                    ? "Promotional calls to a DND number can breach TRAI rules. "
                    : target.channel === "whatsapp"
                      ? "WhatsApp only allows business messages to people who opted in. "
                      : "Outreach needs consent or another lawful basis under the DPDP Act. "}
                  Only continue if this is a reply to them or a service matter,
                  not promotion.
                </p>
                <p className="caption-style text-fg-tertiary">
                  This is noted on their timeline.
                </p>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="subtle" size="sm" autoFocus>
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  size="sm"
                  onClick={confirm}
                  className="bg-warning text-background hover:bg-warning/90 shadow-none"
                >
                  {target.verb} anyway
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
