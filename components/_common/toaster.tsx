"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import Button from "@/components/_ui/button";
import Kbd from "@/components/_ui/kbd";
import { cn } from "@/lib/utils";
import {
  useToastStore,
  type Toast,
  type ToastTone,
} from "@/stores/toast-store";
import XIcon from "@/public/assets/icons/x.svg";
import AlertCircleIcon from "@/public/assets/icons/alert-circle.svg";
import AlertTriangleIcon from "@/public/assets/icons/alert-triangle.svg";
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";
import InfoCircleIcon from "@/public/assets/icons/info-circle.svg";

const DURATION = 5000;
const EDGE = 16;
const TOAST_WIDTH = 360;
const STACK_HEIGHT = 160;
const SURFACES =
  "[data-slot=sheet-content][data-state=open]:not([data-side=left]), [data-slot=dialog-content][data-state=open]";

type Placement = { edge: "bottom" | "top"; right?: number };

function intersects(
  a: DOMRect,
  b: Omit<DOMRect, "toJSON" | "x" | "y" | "width" | "height">,
) {
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  );
}

/** Keeps toasts off open sheets and dialogs so their footers stay clickable. */
function usePlacement(): Placement {
  const [placement, setPlacement] = useState<Placement>({ edge: "bottom" });

  useEffect(() => {
    let frame = 0;
    function measure() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const mobile = width < 640;
        const zone = {
          left: mobile ? 0 : width - EDGE - TOAST_WIDTH,
          right: width - (mobile ? 0 : EDGE),
          top: height - EDGE - STACK_HEIGHT,
          bottom: height,
        };
        let next: Placement = { edge: "bottom" };
        for (const surface of document.querySelectorAll(SURFACES)) {
          const rect = surface.getBoundingClientRect();
          if (!intersects(rect, zone)) continue;
          const side = surface.getAttribute("data-side");
          if (side === "right" && rect.left >= TOAST_WIDTH + EDGE * 2) {
            next = { edge: "bottom", right: width - rect.left + EDGE };
          } else {
            next = { edge: "top" };
            break;
          }
        }
        setPlacement((current) =>
          current.edge === next.edge && current.right === next.right
            ? current
            : next,
        );
      });
    }
    const observer = new MutationObserver(measure);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });
    window.addEventListener("resize", measure);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return placement;
}

const TONE = {
  success: { icon: CheckCircleIcon, className: "text-success" },
  info: { icon: InfoCircleIcon, className: "text-fg-secondary" },
  warning: { icon: AlertTriangleIcon, className: "text-warning" },
  danger: { icon: AlertCircleIcon, className: "text-danger" },
} satisfies Record<ToastTone, { icon: unknown; className: string }>;

function isEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((state) => state.dismiss);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const start = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => dismiss(toast.id), DURATION);
  }, [dismiss, toast.id]);

  const pause = useCallback(() => clearTimeout(timer.current), []);

  useEffect(() => {
    start();
    return pause;
  }, [start, pause]);

  const tone = TONE[toast.tone];

  function undo() {
    toast.undo?.();
    dismiss(toast.id);
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.96 }}
      transition={{ type: "spring", duration: 0.3, bounce: 0 }}
      onPointerEnter={pause}
      onPointerLeave={start}
      onFocus={pause}
      onBlur={start}
      className="bg-popover border-line-strong shadow-overlay pointer-events-auto flex min-h-11 w-full items-center gap-2 rounded-xl border py-1.5 pr-1.5 pl-3.5 sm:w-90"
    >
      <tone.icon
        aria-hidden
        className={cn("size-4 shrink-0", tone.className)}
      />
      <span className="lead-style min-w-0 flex-1 py-1.5 leading-snug">
        {toast.message}
      </span>
      {toast.undo && (
        <Button variant="secondary" size="sm" onClick={undo} className="gap-2">
          Undo
          <Kbd className="h-4 min-w-4 px-1 max-sm:hidden">
            {navigator.userAgent.includes("Mac") ? "⌘Z" : "Ctrl Z"}
          </Kbd>
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Dismiss"
        onClick={() => dismiss(toast.id)}
      >
        <XIcon aria-hidden className="size-3.5" />
      </Button>
    </motion.li>
  );
}

export default function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const placement = usePlacement();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "z") return;
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) {
        return;
      }
      if (isEditable(event.target)) return;
      const { toasts, dismiss } = useToastStore.getState();
      const latest = [...toasts].reverse().find((item) => item.undo);
      if (!latest) return;
      event.preventDefault();
      latest.undo?.();
      dismiss(latest.id);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <ol
      data-toaster
      data-edge={placement.edge}
      aria-live="polite"
      aria-label="Recent actions"
      style={placement.right ? { right: placement.right } : undefined}
      className={cn(
        "z-toast duration-base ease-power3-out pointer-events-none fixed inset-x-3 flex flex-col items-end gap-2 transition-[right] sm:inset-x-auto sm:right-4",
        placement.edge === "top"
          ? "top-3 sm:top-4"
          : "short:top-3 short:bottom-auto bottom-[calc(3.75rem+env(safe-area-inset-bottom))] lg:bottom-4",
      )}
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </AnimatePresence>
    </ol>
  );
}
