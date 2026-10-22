"use client";

import { useEffect, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/_ui/dialog";
import LogCallDialog from "@/features/timeline/log-call-dialog";
import { formatPhone, normalizePhone } from "@/lib/domain/normalize";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";

export type Dial = {
  target: { personId: Id<"people"> } | { leadId: Id<"leads"> };
  name: string;
  phone: string;
};

type Logging = Dial & { startedAt: number; durationSeconds?: number };

const MIN_AWAY_SECONDS = 5;
const WATCH_MS = 30_000;

const hasDialer = () =>
  navigator.maxTouchPoints > 0 ||
  /Android|iPhone|iPad/i.test(navigator.userAgent);

function ring(number: string) {
  window.location.href = `tel:${number}`;
}

/**
 * One tap to call. On a phone it opens the dialer and, when the rep comes back
 * after a real call, offers to log it. Elsewhere `tel:` does nothing visible, so
 * it opens the call log with a running timer instead. Render `dialog` once.
 */
export function useDialer() {
  const enabled = useQuery(api.calls.enabled) === true;
  const startCall = useAction(api.calls.start);
  const [choice, setChoice] = useState<Dial | null>(null);
  const [watching, setWatching] = useState<Dial | null>(null);
  const [logging, setLogging] = useState<Logging | null>(null);

  useEffect(() => {
    if (!watching) return;
    let leftAt: number | null = null;
    const give = setTimeout(() => setWatching(null), WATCH_MS);
    const leave = () => {
      leftAt ??= Date.now();
      clearTimeout(give);
    };
    const back = () => {
      if (leftAt === null) return;
      const seconds = Math.round((Date.now() - leftAt) / 1000);
      if (seconds < MIN_AWAY_SECONDS) {
        leftAt = null;
        return;
      }
      setLogging({ ...watching, startedAt: leftAt, durationSeconds: seconds });
      setWatching(null);
    };
    const onVisibility = () => (document.hidden ? leave() : back());
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", leave);
    window.addEventListener("focus", back);
    return () => {
      clearTimeout(give);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", leave);
      window.removeEventListener("focus", back);
    };
  }, [watching]);

  function fromDevice(item: Dial) {
    setChoice(null);
    if (!hasDialer()) {
      setLogging({ ...item, startedAt: Date.now() });
      return;
    }
    setWatching(item);
    ring(normalizePhone(item.phone) ?? item.phone);
  }

  async function fromCrm(item: Dial) {
    setChoice(null);
    try {
      await startCall({ target: item.target });
      toast(`Ringing your phone, then ${item.name}`, { tone: "info" });
    } catch (error) {
      toast(readError(error, "Couldn't start the call").message, {
        tone: "danger",
      });
    }
  }

  const dial = (item: Dial) => (enabled ? setChoice(item) : fromDevice(item));

  const dialog = (
    <>
      {logging && (
        <LogCallDialog
          key={logging.startedAt}
          call={logging}
          onClose={() => setLogging(null)}
        />
      )}
      <Dialog
        open={choice !== null}
        onOpenChange={(open) => !open && setChoice(null)}
      >
        <DialogContent className="max-w-104">
          {choice && (
            <>
              <DialogHeader>
                <DialogTitle>Call {choice.name}</DialogTitle>
                <DialogDescription>
                  {formatPhone(choice.phone)}
                </DialogDescription>
              </DialogHeader>
              <p className="text-fg-secondary px-6 py-5 text-sm leading-snug">
                From the CRM rings your saved number first, then connects{" "}
                {choice.name}, and the call is logged for you.
              </p>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="subtle" size="sm">
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fromDevice(choice)}
                >
                  From this device
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void fromCrm(choice)}
                >
                  From the CRM
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );

  return { dial, dialog };
}
