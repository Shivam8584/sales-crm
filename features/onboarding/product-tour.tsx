"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import { useViewer } from "@/hooks/use-viewer";
import { MOD_KEY } from "@/lib/keyboard";
import { useUiStore } from "@/stores/ui-store";
import { useTour } from "./tour-store";

const STEPS = [
  {
    id: "today",
    title: "Today",
    body: "Your day starts here: leads to answer, tasks due and deals closing.",
  },
  {
    id: "search",
    title: "Search and commands",
    body: `Press ${MOD_KEY} K to find any account, person, lead or deal, or run a command.`,
  },
  {
    id: "nav",
    title: "Navigation",
    body: "Pipeline, records and reports. Press G then a letter to jump.",
  },
  {
    id: "inbox",
    title: "Inbox",
    body: "Mentions, SLA alerts and approvals land here.",
  },
  {
    id: "create",
    title: "Create",
    body: "Press C anywhere to create a record.",
  },
  {
    id: "help",
    title: "Help",
    body: "Every shortcut is under ? — and you can replay this tour from the account menu.",
  },
];

const PAD = 8;
const GAP = 12;
const MARGIN = 12;
const PHONE_WIDTH = 640;
const OVERLAY = "[role=dialog], [role=alertdialog], [role=menu]";

function findTarget(id: string) {
  for (const el of document.querySelectorAll<HTMLElement>(
    `[data-tour="${id}"]`,
  )) {
    const { width, height } = el.getBoundingClientRect();
    if (width > 0 && height > 0) return el;
  }
  return null;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

type Layout = {
  spot: { top: number; left: number; width: number; height: number } | null;
  card: { top: number; left: number } | null;
};

function TourCard({ onClose }: { onClose: (completed: boolean) => void }) {
  const [steps] = useState(() => STEPS.filter((s) => findTarget(s.id)));
  const [index, setIndex] = useState(0);
  const [layout, setLayout] = useState<Layout>({
    spot: null,
    card: { top: 0, left: 0 },
  });
  const cardRef = useRef<HTMLDivElement>(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  const next = useCallback(() => {
    if (last) onClose(true);
    else setIndex((i) => i + 1);
  }, [last, onClose]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!step) onClose(false);
  }, [step, onClose]);

  useLayoutEffect(() => {
    if (!step) return;
    findTarget(step.id)?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });

    function place() {
      const el = findTarget(step.id);
      const card = cardRef.current;
      if (!el || !card) return;
      const r = el.getBoundingClientRect();
      const spot = {
        top: r.top - PAD,
        left: r.left - PAD,
        width: r.width + PAD * 2,
        height: r.height + PAD * 2,
      };
      if (window.innerWidth < PHONE_WIDTH) {
        setLayout({ spot, card: null });
        return;
      }
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = card.offsetWidth;
      const h = card.offsetHeight;
      let top: number;
      let left: number;
      if (spot.left + spot.width + GAP + w <= vw - MARGIN) {
        left = spot.left + spot.width + GAP;
        top = spot.top;
      } else {
        left = spot.left + spot.width - w;
        top = spot.top + spot.height + GAP;
        if (top + h > vh - MARGIN) top = spot.top - GAP - h;
      }
      setLayout({
        spot,
        card: {
          top: clamp(top, MARGIN, vh - h - MARGIN),
          left: clamp(left, MARGIN, vw - w - MARGIN),
        },
      });
    }

    place();
    if (!cardRef.current?.contains(document.activeElement))
      cardRef.current?.focus({ preventScroll: true });
    const target = findTarget(step.id);
    const observer = new ResizeObserver(place);
    if (target) observer.observe(target);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [step]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape") onClose(true);
      else if (event.key === "ArrowRight") next();
      else if (event.key === "ArrowLeft") back();
      else if (
        event.key === "Enter" &&
        !(event.target instanceof HTMLButtonElement)
      )
        next();
      else return;
      event.preventDefault();
      event.stopPropagation();
    }
    function onFocusIn(event: FocusEvent) {
      if (!cardRef.current?.contains(event.target as Node))
        cardRef.current?.focus({ preventScroll: true });
    }
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [next, back, onClose]);

  if (!step) return null;

  return (
    <div className="z-overlay animate-in fade-in-0 duration-fast ease-power3-out fixed inset-0 motion-reduce:animate-none">
      {layout.spot && (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-lg shadow-[0_0_0_9999px_var(--scrim)]"
          style={layout.spot}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label="Product tour"
        aria-live="polite"
        tabIndex={-1}
        style={layout.card ?? undefined}
        className={
          "border-line-strong bg-popover text-popover-foreground shadow-overlay fixed rounded-xl border p-4 outline-none " +
          (layout.card ? "w-80" : "inset-x-3 bottom-3")
        }
      >
        <h2 className="lead-style font-medium">{step.title}</h2>
        <p className="caption-style text-fg-secondary mt-1">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <span className="caption-style text-fg-tertiary mr-auto tabular-nums">
            {index + 1} of {steps.length}
          </span>
          <Button variant="ghost" size="xs" onClick={() => onClose(true)}>
            Skip tour
          </Button>
          {index > 0 && (
            <Button variant="secondary" size="xs" onClick={back}>
              Back
            </Button>
          )}
          <Button variant="primary" size="xs" onClick={next}>
            {last ? "Done" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** First-run walkthrough; the account menu replays it. */
export default function ProductTour() {
  const done = useViewer().tourCompletedAt !== undefined;
  const completeTour = useMutation(api.members.completeTour);
  const open = useTour((state) => state.open);
  const covered = useUiStore(
    (state) => state.commandOpen || state.shortcutsOpen,
  );
  const [ready, setReady] = useState(false);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!done) useTour.getState().replay();
  }, [done]);

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => {
      if (document.querySelector(OVERLAY)) return;
      clearInterval(timer);
      opener.current = document.activeElement;
      setReady(true);
    }, 400);
    return () => {
      clearInterval(timer);
      setReady(false);
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [open]);

  const close = useCallback(
    (completed: boolean) => {
      useTour.getState().close();
      if (completed) completeTour().catch(() => undefined);
    },
    [completeTour],
  );

  if (!open || !ready || covered) return null;
  return <TourCard onClose={close} />;
}
