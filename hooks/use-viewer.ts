"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/** The signed-in member. Only call below the membership gate, where it is always set. */
export function useViewer() {
  const result = useQuery(api.members.viewer);
  const member = result?.member;
  if (!member) throw new Error("useViewer used outside the membership gate");
  return member;
}

export function useMembers() {
  return useQuery(api.members.list);
}
