"use client";

import type { Id } from "@/convex/_generated/dataModel";

/** Hypedrive platform usage for a linked account, in the account page sidebar. */
export default function AccountPlatform({
  accountId,
}: {
  accountId: Id<"accounts">;
}) {
  void accountId;
  return null;
}
