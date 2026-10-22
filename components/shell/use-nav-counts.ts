"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { istToday } from "@/lib/domain/day";

export function useNavCounts() {
  return useQuery(api.shell.navCounts, { today: istToday() });
}
