"use client";

import type { Id } from "@/convex/_generated/dataModel";

/** Body of the peek sheet for this record type; filled by its module. */
export default function AccountPeek({
  id,
  onClose,
}: {
  id: Id<"accounts">;
  onClose: () => void;
}) {
  void id;
  void onClose;
  return null;
}
