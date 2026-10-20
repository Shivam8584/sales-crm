"use client";

import { useState, type FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/_ui/tabs";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { readError } from "@/lib/errors";
import Logo from "@/public/assets/images/_common/logo.svg";

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
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="bg-card shadow-card flex w-full max-w-90 flex-col rounded-xl">
        <div className="flex flex-col items-center gap-3 px-6 pt-8 pb-2 text-center">
          <Logo aria-hidden className="size-10 overflow-visible" />
          <h1>Hypedrive CRM</h1>
          <p className="caption-style text-fg-secondary leading-snug">
            {flow === "signIn"
              ? "Sign in to see your team's pipeline."
              : "Create an account to join your team's pipeline."}
          </p>
        </div>

        <Tabs
          value={flow}
          onValueChange={(value) => {
            setFlow(value as Flow);
            setError(null);
          }}
        >
          <TabsList className="justify-center px-6 shadow-[inset_0_-1px_0_var(--border)]">
            <TabsTrigger value="signIn">Sign in</TabsTrigger>
            <TabsTrigger value="signUp">Create account</TabsTrigger>
          </TabsList>
        </Tabs>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 px-6 pt-5 pb-6"
        >
          {token && invite !== undefined && (
            <p
              role="status"
              className="caption-style bg-muted text-fg-secondary rounded-lg px-3 py-2.5 leading-snug"
            >
              {invite ? (
                <>
                  You&apos;ve been invited to join as{" "}
                  <span className="text-foreground font-medium">
                    {ROLE_LABEL[invite.role]}
                  </span>
                  .
                </>
              ) : (
                "This invite link has expired or was revoked. Ask an admin for a new one."
              )}
            </p>
          )}
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
            />
          </Field>
          {error && (
            <p role="alert" className="caption-style text-danger leading-snug">
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
      </div>
    </main>
  );
}
