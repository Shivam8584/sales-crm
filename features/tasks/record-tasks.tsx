"use client";

import type { Id } from "@/convex/_generated/dataModel";

export type TaskTarget =
  | { accountId: Id<"accounts"> }
  | { personId: Id<"people"> };

/** Open tasks section on an account or person page. */
export default function RecordTasks({ target }: { target: TaskTarget }) {
  void target;
  return null;
}
