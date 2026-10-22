"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import Skeleton from "@/components/_ui/skeleton";
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
  const methods = useQuery(api.auth.methods);
  const [token] = useState(inviteToken);
  const invite = useQuery(api.invites.lookup, token ? { token } : "skip");
  const [preferPassword, setPreferPassword] = useState(false);
  const [flow, setFlow] = useState<Flow>(token ? "signUp" : "signIn");
  const passwordView =
    !!methods?.password && (!methods.logto || preferPassword);
  const signingUp = passwordView && flow === "signUp";
  const inviteNote = token && invite !== undefined && (
    <InviteNote invite={invite} />
  );

  return (
    <AuthCard
      title={
        invite
          ? "Join your team on Hypedrive"
          : signingUp
            ? "Create your account"
            : "Sign in to Hypedrive"
      }
      description={
        signingUp
          ? "Set a password to start working leads, accounts and deals."
          : "Pick up your team's pipeline where you left it."
      }
    >
      {methods === undefined ? (
        <div className="border-border border-t px-6 py-5">
          <Skeleton className="h-9 w-full rounded-full" />
        </div>
      ) : passwordView ? (
        <PasswordForm
          flow={flow}
          onFlowChange={setFlow}
          invite={invite}
          inviteNote={inviteNote}
          onUseSso={methods.logto ? () => setPreferPassword(false) : undefined}
        />
      ) : methods.logto ? (
        <SsoPanel
          inviteNote={inviteNote}
          onUsePassword={
            methods.password ? () => setPreferPassword(true) : undefined
          }
        />
      ) : (
        <p className="border-border text-fg-secondary border-t px-6 py-5 text-center">
          Sign-in isn&apos;t set up for this workspace yet. Ask an admin.
        </p>
      )}
    </AuthCard>
  );
}

function SsoPanel({
  inviteNote,
  onUsePassword,
}: {
  inviteNote: ReactNode;
  onUsePassword?: () => void;
}) {
  const { signIn } = useAuthActions();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function continueWithSso() {
    setPending(true);
    setError(null);
    try {
      await signIn("logto", {
        redirectTo: window.location.pathname + window.location.search,
      });
    } catch (caught) {
      setError(readError(caught, "Couldn't reach Hypedrive SSO.").message);
      setPending(false);
    }
  }

  return (
    <div className="border-border flex flex-col gap-3 border-t px-6 pt-5 pb-6">
      {inviteNote}
      <Button
        variant="primary"
        size="md"
        loading={pending}
        onClick={continueWithSso}
        className="w-full"
      >
        Continue with Hypedrive SSO
      </Button>
      {error && <ErrorLine message={error} />}
      {onUsePassword && (
        <Button
          variant="ghost"
          size="md"
          onClick={onUsePassword}
          className="w-full"
        >
          Use email and password
        </Button>
      )}
    </div>
  );
}

function PasswordForm({
  flow,
  onFlowChange,
  invite,
  inviteNote,
  onUseSso,
}: {
  flow: Flow;
  onFlowChange: (flow: Flow) => void;
  invite: { email: string; role: Role } | null | undefined;
  inviteNote: ReactNode;
  onUseSso?: () => void;
}) {
  const { signIn } = useAuthActions();
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
    const invite = inviteToken();
    if (invite) form.set("invite", invite);
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
    <>
      <Tabs
        value={flow}
        onValueChange={(value) => {
          onFlowChange(value as Flow);
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
        {inviteNote}
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
        {error && <ErrorLine message={error} />}
        <div className="mt-1 flex flex-col gap-2">
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={pending}
            className="w-full"
          >
            {flow === "signIn" ? "Sign in" : "Create account"}
          </Button>
          {onUseSso && (
            <Button
              variant="ghost"
              size="md"
              onClick={onUseSso}
              className="w-full"
            >
              Use Hypedrive SSO instead
            </Button>
          )}
        </div>
      </form>
    </>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="caption-style text-danger flex items-start gap-1.5 leading-snug"
    >
      <AlertIcon aria-hidden className="mt-px size-3 shrink-0" />
      {message}
    </p>
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
