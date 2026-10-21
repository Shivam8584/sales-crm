"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "@/convex/_generated/api";
import { recordKey, type RecordType } from "@/lib/domain/notifications";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import PinIcon from "@/public/assets/icons/pin.svg";

type Target = FunctionArgs<typeof api.pins.toggle>["target"];

const TABLE: Record<keyof Target & string, RecordType> = {
  accountId: "accounts",
  personId: "people",
  dealId: "deals",
  leadId: "leads",
};

/** The page action that pins or unpins a record in the sidebar. */
export function usePinAction(target: Target) {
  const pins = useQuery(api.pins.mine, {});
  const toggle = useMutation(api.pins.toggle);
  const [field, id] = Object.entries(target)[0] as [
    keyof Target & string,
    string,
  ];
  const pinned = pins?.some(
    (pin) => pin.record === recordKey(TABLE[field], id),
  );

  return {
    label: pinned ? "Unpin from sidebar" : "Pin to sidebar",
    icon: PinIcon,
    disabled: pins === undefined,
    onSelect: async () => {
      try {
        const now = await toggle({ target });
        toast(now ? "Pinned to the sidebar" : "Unpinned", {
          undo: () => void toggle({ target }),
        });
      } catch (error) {
        toast(readError(error).message, { tone: "danger" });
      }
    },
  };
}
