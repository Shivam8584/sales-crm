"use client";

import { useState } from "react";
import type { FunctionArgs } from "convex/server";
import type { api } from "@/convex/_generated/api";
import MessageIcon from "@/public/assets/icons/message.svg";
import { DraftDialog } from "./draft-dialog";
import { useAiEnabled } from "./use-ai";

type Target = FunctionArgs<typeof api.ai.draft>["target"];

/** The "Draft a message" page action and its dialog; both are absent when AI is off. */
export function useDraftAction(target: Target) {
  const enabled = useAiEnabled();
  const [open, setOpen] = useState(false);
  return {
    action: enabled && {
      label: "Draft a message",
      icon: MessageIcon,
      onSelect: () => setOpen(true),
    },
    dialog: enabled && (
      <DraftDialog target={target} open={open} onOpenChange={setOpen} />
    ),
  };
}
