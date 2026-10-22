"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Command as CommandPrimitive } from "cmdk";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/_ui/popover";
import { SUBJECT_LABEL, type SubjectKind } from "@/lib/domain/automations";
import { readError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import AutomationIcon from "@/public/assets/icons/automation.svg";

type EnrolResult = FunctionReturnType<typeof api.automations.enrolMany>;

const plural = (count: number, [one, many]: [string, string]) =>
  `${count} ${count === 1 ? one : many}`;

/** One line for the toast: what happened to every selected record. */
export function enrolSummary(result: EnrolResult, noun: [string, string]) {
  const parts = [
    result.enrolled > 0 &&
      `Added ${plural(result.enrolled, noun)} to ${result.automation}`,
    result.alreadyRunning > 0 && `${result.alreadyRunning} already running`,
    result.alreadyFinished > 0 &&
      `${result.alreadyFinished} already went through`,
    result.skipped > 0 &&
      `${result.skipped} skipped${result.problems[0] ? ` (${result.problems[0].message.toLowerCase()})` : ""}`,
  ].filter(Boolean);
  if (result.enrolled === 0) {
    return `Nothing added to ${result.automation}: ${parts.join(", ")}`;
  }
  return parts.join(" · ");
}

type AddToAutomationProps = {
  kind: SubjectKind;
  ids: string[];
  /** Called after a successful enrolment, e.g. to clear the selection. */
  onDone?: () => void;
  align?: "start" | "end";
  side?: "top" | "bottom";
  className?: string;
  children?: ReactNode;
};

/** Picks an active sequence and enrols the given records in it by hand. */
export default function AddToAutomation({
  kind,
  ids,
  onDone,
  align = "start",
  side = "top",
  className,
  children,
}: AddToAutomationProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const commandRef = useRef<HTMLDivElement>(null);
  const targets = useQuery(
    api.automations.manualTargets,
    open ? { kind } : "skip",
  );
  const safety = useQuery(api.automations.safety, open ? {} : "skip");
  const enrolMany = useMutation(api.automations.enrolMany);
  const noun = SUBJECT_LABEL[kind];

  async function pick(id: Id<"automations">) {
    setOpen(false);
    setBusy(true);
    try {
      const result = await enrolMany({
        automationId: id,
        subjects: ids.map((value) => ({ kind, id: value })),
      });
      toast(enrolSummary(result, noun), {
        tone: result.enrolled > 0 ? "success" : "warning",
      });
      if (result.enrolled > 0) onDone?.();
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  const stopped = Boolean(safety?.killSwitch);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={busy || ids.length === 0}
        aria-label={`Add ${ids.length === 1 ? `this ${noun[0]}` : `${ids.length} ${noun[1]}`} to a sequence`}
        className={cn(
          "hover:bg-overlay-1 data-[state=open]:bg-overlay-2 focus-visible:ring-ring duration-fast text-foreground inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs leading-none font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-60",
          className,
        )}
      >
        {children ?? (busy ? "Adding…" : "Add to sequence")}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        className="w-72 p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          commandRef.current?.querySelector("input")?.focus();
        }}
      >
        <CommandPrimitive
          ref={commandRef}
          loop
          label="Sequences"
          className="flex flex-col outline-none"
        >
          <CommandPrimitive.Input
            placeholder="Search sequences…"
            className="border-line-strong placeholder:text-fg-tertiary h-10 border-b bg-transparent px-3 text-sm outline-none"
          />
          {stopped && (
            <p className="caption-style text-warning border-line-strong border-b px-3 py-2 leading-snug">
              Sequences are stopped for the workspace, so nothing can be added
              right now.
            </p>
          )}
          <CommandPrimitive.List className="scrollbar-none max-h-72 overflow-y-auto p-1">
            {targets === undefined ? (
              <CommandPrimitive.Loading>
                <div className="caption-style text-fg-tertiary py-6 text-center">
                  Loading…
                </div>
              </CommandPrimitive.Loading>
            ) : targets.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-5 text-center">
                <AutomationIcon
                  aria-hidden
                  className="text-fg-tertiary size-4"
                />
                <span className="text-sm font-medium">
                  No active sequence runs on {noun[1]}
                </span>
                <Link
                  href="/automations"
                  className="caption-style text-fg-secondary hover:text-foreground focus-visible:ring-ring rounded-sm underline-offset-2 outline-none hover:underline focus-visible:ring-2"
                  onClick={() => setOpen(false)}
                >
                  Open sequences
                </Link>
              </div>
            ) : (
              <>
                <CommandPrimitive.Empty className="caption-style text-fg-tertiary py-6 text-center">
                  No matches
                </CommandPrimitive.Empty>
                {targets.map((target) => (
                  <CommandPrimitive.Item
                    key={target._id}
                    value={`${target.name} ${target._id}`}
                    disabled={stopped}
                    onSelect={() => void pick(target._id)}
                    className="data-[selected=true]:bg-overlay-2 flex min-h-11 cursor-pointer flex-col justify-center gap-0.5 rounded-md px-2 py-1.5 outline-none data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50"
                  >
                    <span className="truncate text-sm leading-5">
                      {target.name}
                    </span>
                    <span className="caption-style text-fg-tertiary truncate">
                      {target.manual ? "Manual" : target.trigger} ·{" "}
                      {target.active} running
                    </span>
                  </CommandPrimitive.Item>
                ))}
              </>
            )}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </PopoverContent>
    </Popover>
  );
}
