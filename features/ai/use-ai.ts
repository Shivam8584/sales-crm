"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";

export function useAiEnabled() {
  return useQuery(api.ai.enabled, {}) === true;
}

export function aiError(error: unknown, fallback = "Couldn't reach AI") {
  const { code, message } = readError(error, fallback);
  toast(
    code === "unavailable"
      ? "AI isn't set up yet"
      : code === "rate_limited"
        ? "Daily AI limit reached"
        : message,
    { tone: "danger" },
  );
}
