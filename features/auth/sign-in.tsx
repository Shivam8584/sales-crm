"use client";

import { useState, type FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import Tag from "@/components/_ui/tag";
import { Tabs, TabsList, TabsTrigger } from "@/components/_ui/tabs";
import { ROLE_TONE } from "@/features/team/roles";
import type { Role } from "@/lib/domain/enums";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { readError } from "@/lib/errors";
import AlertIcon from "@/public/assets/icons/alert-triangle.svg";
import MailIcon from "@/public/assets/icons/mail.svg";
import AuthCard from "./auth-card";

type Flow = "signIn" | "signUp";

const MIN_PASSWORD = 8;
const INVITE_TOKEN = /^[0-9a-f]{32,128}$/;

function inviteToken() {
  const token = new URLSearchParams(window.location.search).get("invite");
  return token && INVITE_TOKEN.test(token) ? token : null;
}

export default function SignIn() {
  const { signIn } = useAuthActions();
  const [token] = useState(inviteToken);
  const invite = useQuery(api.invites.lookup, token ? { token } : "skip");
  const [flow, setFlow] = useState<Flow>(token ? "signUp" : "signIn");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (flow === "signUp" && password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters for the password.`);
      return;
    }
    form.set("flow", flow);
    setPending(true);
    setError(null);
    try {
      await signIn("password", form);
    } catch (caught) {
      setError(
        readError(
          caught,
          flow === "signIn"
            ? "That email and password don't match an account."
            : "Couldn't create the account. The email may already be registered.",
        ).message,
      );
      setPending(false);
    }
  }

  return (
    <AuthCard
      title={
        invite
          ? "Join your team on Hypedrive"
          : flow === "signIn"
            ? "Sign in to Hypedrive"
            : "Create your account"
      }
      description={
        flow === "signIn"
          ? "Pick up your team's pipeline where you left it."
          : "Set a password to start working leads, accounts and deals."
      }
    >
      <Tabs
        value={flow}
        onValueChange={(value) => {
          setFlow(value as Flow);
          setError(null);
        }}
      >
        <TabsList
          aria-label="Sign in or create an account"
          className="justify-center gap-6 px-6 shadow-[inset_0_-1px_0_var(--border)]"
        >
          <TabsTrigger value="signIn" className="py-3">
            Sign in
          </TabsTrigger>
          <TabsTrigger value="signUp" className="py-3">
            Create account
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 px-6 pt-5 pb-6"
      >
        {token && invite !== undefined && <InviteNote invite={invite} />}
        {flow === "signUp" && (
          <Field label="Full name" htmlFor="auth-name">
            <Input
              id="auth-name"
              name="name"
              autoComplete="name"
              required
              placeholder="Priya Sharma"
            />
          </Field>
        )}
        <Field label="Work email" htmlFor="auth-email">
          <Input
            key={invite?.email ?? "email"}
            id="auth-email"
            name="email"
            defaultValue={invite?.email}
            readOnly={!!invite}
            className="read-only:bg-muted read-only:text-fg-secondary"
            type="email"
            autoComplete="email"
            spellCheck={false}
            required
            placeholder="you@company.com"
          />
        </Field>
        <Field
          label="Password"
          htmlFor="auth-password"
          hint={
            flow === "signUp"
              ? `At least ${MIN_PASSWORD} characters.`
              : undefined
          }
        >
          <Input
            id="auth-password"
            name="password"
            type="password"
            autoComplete={
              flow === "signIn" ? "current-password" : "new-password"
            }
            required
            aria-describedby={
              flow === "signUp" ? "auth-password-hint" : undefined
            }
          />
        </Field>
        {error && (
          <p
            role="alert"
            className="caption-style text-danger flex items-start gap-1.5 leading-snug"
          >
            <AlertIcon aria-hidden className="mt-px size-3 shrink-0" />
            {error}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          size="md"
          loading={pending}
          className="mt-1 w-full"
        >
          {flow === "signIn" ? "Sign in" : "Create account"}
        </Button>
      </form>
    </AuthCard>
  );
}

function InviteNote({
  invite,
}: {
  invite: { email: string; role: Role } | null;
}) {
  if (!invite) {
    return (
      <div
        role="status"
        className="border-border bg-overlay-1 flex items-start gap-3 rounded-xl border p-3 text-left"
      >
        <span className="bg-muted shadow-hairline flex size-7 shrink-0 items-center justify-center rounded-full">
          <AlertIcon aria-hidden className="text-warning size-3.5" />
        </span>
        <p className="caption-style text-fg-secondary pt-0.5 leading-snug">
          This invite link has expired or was revoked. Ask an admin for a new
          one, or sign in if you already have an account.
        </p>
      </div>
    );
  }
  return (
    <div
      role="status"
      className="border-border bg-overlay-1 flex items-center gap-3 rounded-xl border p-3 text-left"
    >
      <span className="bg-muted shadow-hairline flex size-7 shrink-0 items-center justify-center rounded-full">
        <MailIcon aria-hidden className="text-fg-secondary size-3.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="lead-style font-medium">You&apos;re invited</span>
        <span
          className="caption-style text-fg-tertiary truncate"
          title={invite.email}
        >
          {invite.email}
        </span>
      </span>
      <Tag tone={ROLE_TONE[invite.role]} size="sm">
        {ROLE_LABEL[invite.role]}
      </Tag>
    </div>
  );
}
