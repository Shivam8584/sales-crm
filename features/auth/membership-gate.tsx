"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import { readError } from "@/lib/errors";
import Logo from "@/public/assets/images/_common/logo.svg";
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
  }, [needsJoin, join]);

  if (!isLoading && !isAuthenticated) return <SignIn />;

  if (joinError || viewer?.member?.status === "deactivated") {
    return (
      <Blocked
        message={joinError ?? "Your access to this workspace has been removed."}
        onSignOut={() => void signOut()}
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
      className="flex min-h-dvh items-center justify-center"
      aria-label="Loading workspace"
    >
      <Logo aria-hidden className="size-9 animate-pulse overflow-visible" />
    </main>
  );
}

function Blocked({
  message,
  onSignOut,
}: {
  message: string;
  onSignOut: () => void;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="flex max-w-80 flex-col items-center gap-3 text-center">
        <Logo aria-hidden className="size-9 overflow-visible" />
        <h1>You can&apos;t enter this workspace</h1>
        <p className="text-fg-secondary text-sm leading-snug">{message}</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={onSignOut}
          className="mt-2"
        >
          Sign out
        </Button>
      </div>
    </main>
  );
}
