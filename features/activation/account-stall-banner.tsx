"use client";

import type { Id } from "@/convex/_generated/dataModel";

/** Shown at the top of an account page when its onboarding is stuck; filled by activation. */
export default function AccountStallBanner({
  accountId,
}: {
  accountId: Id<"accounts">;
}) {
  void accountId;
  return null;
}
