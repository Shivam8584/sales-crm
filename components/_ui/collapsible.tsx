"use client";

import type { ComponentProps } from "react";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";

function Collapsible(props: ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger(
  props: ComponentProps<typeof CollapsiblePrimitive.Trigger>,
) {
  return (
    <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />
  );
}

/** Animates its height open and closed. */
function CollapsibleContent({
  className,
  ...props
}: ComponentProps<typeof CollapsiblePrimitive.Content>) {
  return (
    <CollapsiblePrimitive.Content
      data-slot="collapsible-content"
      className={cn(
        "data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down ease-power3-out overflow-hidden [--tw-duration:200ms]",
        className,
      )}
      {...props}
    />
  );
}

/** Rotating chevron for a collapsible trigger; flips with the parent's `data-state`. */
function CollapsibleChevron({ className }: { className?: string }) {
  return (
    <ChevronDownIcon
      aria-hidden
      className={cn(
        "text-fg-tertiary duration-base ease-power3-out size-3 shrink-0 -rotate-90 transition-transform group-data-[state=open]/collapsible:rotate-0",
        className,
      )}
    />
  );
}

export {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  CollapsibleChevron,
};
