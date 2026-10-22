"use client";

import { useEffect, useRef } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { recordKey, type RecordType } from "@/lib/domain/notifications";
import { useAiEnabled } from "./use-ai";

/** Asks the server to refresh suggestions once per mount; failures are ignored. */
export function useRefreshNextActions(ready: boolean) {
  const enabled = useAiEnabled();
  const refresh = useAction(api.ai.refreshNextActions);
  const asked = useRef(false);

  useEffect(() => {
    if (!enabled || !ready || asked.current) return;
    asked.current = true;
    refresh({}).catch(() => {});
  }, [enabled, ready, refresh]);
}

export function NextAction({ type, id }: { type: RecordType; id: string }) {
  const enabled = useAiEnabled();
  const actions = useQuery(api.ai.nextActions, enabled ? {} : "skip");
  const text = actions?.[recordKey(type, id)]?.text;
  if (!text) return null;
  return (
    <span className="caption-style text-fg-tertiary truncate">
      Suggested: {text}
    </span>
  );
}
