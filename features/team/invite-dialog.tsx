"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/_ui/dialog";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { ROLES, type Role } from "@/lib/domain/enums";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { normalizeEmail } from "@/lib/domain/normalize";
import { readError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { copyText, inviteUrl } from "./invite-link";
import { ROLE_DESCRIPTION } from "./roles";
import UserPlusIcon from "@/public/assets/icons/user-plus.svg";

type Errors = Partial<Record<"email" | "form", string>>;
type Sent = { email: string; role: Role; url: string };

/** Creates an invite, then shows the one-time link to send. */
export default function InviteDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: Id<"invites">, url: string) => void;
}) {
  const create = useMutation(api.invites.create);
  const team = useQuery(api.members.team, {});
  const invites = useQuery(api.invites.list, {});
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("rep");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);

  function reset() {
    setEmail("");
    setRole("rep");
    setErrors({});
    setSent(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeEmail(email);
    if (!normalized) {
      setErrors({ email: "Enter a valid email address" });
      return;
    }
    const member = team?.find((item) => item.email === normalized);
    const pending = invites?.some(
      (item) => item.email === normalized && item.status === "pending",
    );
    if (member || pending) {
      setErrors({
        email: member
          ? member.status === "active"
            ? `${member.name} is already on the team`
            : `${member.name} was deactivated. Reactivate them from the members list.`
          : "This email already has a pending invite",
      });
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      const result = await create({ email, role });
      const url = inviteUrl(result.token);
      onCreated(result.id, url);
      setSent({ email: result.email, role, url });
    } catch (error) {
      const { message, field } = readError(error, "Couldn't create the invite");
      setErrors({ [field === "email" ? "email" : "form"]: message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-110" onCloseAutoFocus={reset}>
        {sent ? (
          <InviteSent
            sent={sent}
            onAnother={() => {
              reset();
              requestAnimationFrame(() =>
                document.getElementById("invite-email")?.focus(),
              );
            }}
          />
        ) : (
          <form onSubmit={submit} noValidate>
            <DialogHeader>
              <DialogTitle>Invite to workspace</DialogTitle>
              <DialogDescription>
                You&apos;ll get a sign-up link to share. It works for this email
                only and expires in 7 days.
              </DialogDescription>
            </DialogHeader>
            <fieldset className="shadow-divider flex min-w-0 flex-col gap-4 px-6 py-5">
              <legend className="eyebrow-style text-fg-secondary float-left mb-0 w-full">
                Invitee
              </legend>
              <Field
                label="Email"
                htmlFor="invite-email"
                required
                error={errors.email}
              >
                <Input
                  id="invite-email"
                  type="email"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="priya@hypedrive.in"
                  aria-invalid={errors.email ? true : undefined}
                  className="aria-invalid:border-danger"
                />
              </Field>
            </fieldset>
            <fieldset className="flex min-w-0 flex-col gap-4 px-6 py-5">
              <legend className="eyebrow-style text-fg-secondary float-left mb-0 w-full">
                Role
              </legend>
              <div className="flex flex-col gap-1.5">
                {ROLES.map((value) => (
                  <label
                    key={value}
                    className={cn(
                      "has-focus-visible:ring-ring duration-fast flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition-[background-color,box-shadow] has-focus-visible:ring-2",
                      role === value
                        ? "border-selected bg-overlay-1"
                        : "hover:bg-overlay-1",
                    )}
                  >
                    <input
                      type="radio"
                      name="invite-role"
                      value={value}
                      checked={role === value}
                      onChange={() => setRole(value)}
                      className="accent-selected mt-0.5 size-3.5 shrink-0"
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="flex items-center gap-2 text-sm leading-none font-medium">
                        {ROLE_LABEL[value]}
                      </span>
                      <span className="caption-style text-fg-tertiary leading-snug">
                        {ROLE_DESCRIPTION[value]}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {errors.form && (
                <p role="alert" className="caption-style text-danger">
                  {errors.form}
                </p>
              )}
            </fieldset>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={saving}
              >
                <UserPlusIcon aria-hidden className="size-3" />
                Create invite
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InviteSent({
  sent,
  onAnother,
}: {
  sent: Sent;
  onAnother: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const ok = await copyText(sent.url);
    setCopied(ok);
    if (!ok) document.getElementById("invite-link")?.focus();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Invite ready</DialogTitle>
        <DialogDescription>
          Send this link to {sent.email}. They&apos;ll join as{" "}
          {ROLE_LABEL[sent.role].toLowerCase()} once they create an account.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2 px-6 py-5">
        <Field
          label="Invite link"
          htmlFor="invite-link"
          hint="Shown once. Resend from the invites list for a new link."
        >
          <div className="flex gap-2">
            <Input
              id="invite-link"
              readOnly
              value={sent.url}
              onFocus={(event) => event.currentTarget.select()}
              className="text-fg-secondary font-mono text-xs"
            />
            <Button
              variant={copied ? "secondary" : "primary"}
              size="control"
              className="w-20 px-3"
              autoFocus
              onClick={() => void copy()}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </Field>
      </div>
      <DialogFooter>
        <Button variant="secondary" size="sm" onClick={onAnother}>
          Invite another
        </Button>
        <DialogClose asChild>
          <Button variant="primary" size="sm">
            Done
          </Button>
        </DialogClose>
      </DialogFooter>
    </>
  );
}
