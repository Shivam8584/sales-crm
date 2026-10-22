"use client";

import { useEffect } from "react";
import Button from "@/components/_ui/button";
import { reportError } from "@/lib/monitoring";
import { setThemePreference, useThemePreference } from "@/lib/theme";
import AuthCard from "./auth-card";

/** Fallback for a crashed screen: reports the error and offers a retry. */
export default function ErrorCard({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const theme = useThemePreference();
  useEffect(() => reportError(error), [error]);
  // When server rendering failed, the theme script in the layout never ran.
  useEffect(() => {
    if (!document.documentElement.dataset.theme) setThemePreference(theme);
  }, [theme]);

  return (
    <AuthCard
      title="Something went wrong"
      description="Try again, or head back to Today."
      footer={error.digest ? `Error ID ${error.digest}` : undefined}
    >
      <div className="flex flex-col gap-2">
        <Button variant="primary" size="md" onClick={retry} className="w-full">
          Try again
        </Button>
        <Button href="/" variant="ghost" size="md" className="w-full">
          Go to Today
        </Button>
      </div>
    </AuthCard>
  );
}
