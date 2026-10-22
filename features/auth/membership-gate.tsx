"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import { readError } from "@/lib/errors";
import AuthCard, { LogoTile } from "./auth-card";
import SignIn from "./sign-in";

const INVITE_PARAM = "invite";

function inviteFromUrl() {
  if (typeof window === "undefined") return undefined;
  return (
    new URLSearchParams(window.location.search).get(INVITE_PARAM) ?? undefined
  );
}

/**
 * Renders the app only for active members: signed-out users see sign-in,
 * new users are admitted once, and removed members see why they can't enter.
 */
export default function MembershipGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.members.viewer, isAuthenticated ? {} : "skip");
  const join = useMutation(api.members.join);
  const { signOut } = useAuthActions();
  const [joinError, setJoinError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const joining = useRef(false);

  const needsJoin = viewer !== undefined && viewer !== null && !viewer.member;

  useEffect(() => {
    if (!needsJoin || joining.current) return;
    joining.current = true;
    join({ inviteToken: inviteFromUrl() })
      .then(() => {
        const url = new URL(window.location.href);
        if (url.searchParams.has(INVITE_PARAM)) {
          url.searchParams.delete(INVITE_PARAM);
          window.history.replaceState(null, "", url);
        }
      })
      .catch((error) => setJoinError(readError(error).message))
      .finally(() => {
        joining.current = false;
      });
  }, [needsJoin, join, attempt]);

  if (!isLoading && !isAuthenticated) return <SignIn />;

  if (joinError || viewer?.member?.status === "deactivated") {
    return (
      <Blocked
        message={joinError ?? "Your access to this workspace has been removed."}
        onSignOut={() => void signOut()}
        onRetry={
          joinError
            ? () => {
                setJoinError(null);
                setAttempt((count) => count + 1);
              }
            : undefined
        }
      />
    );
  }

  if (!viewer?.member) return <Splash />;

  return <>{children}</>;
}

function Splash() {
  return (
    <main
      aria-busy
      aria-label="Loading workspace"
      className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4"
    >
      <LogoTile className="animate-pulse motion-reduce:animate-none" />
      <p className="caption-style text-fg-tertiary" role="status">
        Opening your workspace…
      </p>
    </main>
  );
}

function Blocked({
  message,
  onSignOut,
  onRetry,
}: {
  message: string;
  onSignOut: () => void;
  onRetry?: () => void;
}) {
  return (
    <AuthCard title="You can't enter this workspace" description={message}>
      <div className="flex flex-col gap-3">
        {onRetry && (
          <Button
            variant="primary"
            size="md"
            onClick={onRetry}
            className="w-full"
          >
            Try again
          </Button>
        )}
        <Button
          variant="secondary"
          size="md"
          onClick={onSignOut}
          className="w-full"
        >
          Sign out
        </Button>
        <p className="caption-style text-fg-tertiary text-center leading-snug">
          Wrong account? Sign out and use your work email.
        </p>
      </div>
    </AuthCard>
  );
}
