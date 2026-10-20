"use client";

import type { Id } from "@/convex/_generated/dataModel";

/** Verified registry details (GST) shown in the account page sidebar. */
export default function AccountVerification({
  accountId,
}: {
  accountId: Id<"accounts">;
}) {
  void accountId;
  return null;
}
