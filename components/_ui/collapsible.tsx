"use client";

import type { ComponentProps, ReactNode } from "react";
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

/**
 * A titled block that folds away: eyebrow title with a chevron, an optional
 * control on the right, and its content. Used in record sidebars and long settings.
 */
function CollapsibleSection({
  title,
  action,
  defaultOpen = true,
  open,
  onOpenChange,
  children,
  className,
  contentClassName,
}: {
  title: string;
  action?: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      open={open}
      onOpenChange={onOpenChange}
      className={cn("group/collapsible flex min-w-0 flex-col", className)}
    >
      <div className="min-h-control-md flex items-center justify-between gap-2">
        <CollapsibleTrigger className="eyebrow-style text-foreground hover:text-fg-secondary focus-visible:ring-ring duration-fast -mx-1 flex min-w-0 cursor-pointer items-center gap-1.5 rounded-sm px-1 py-1 transition-colors outline-none focus-visible:ring-2">
          <span className="truncate">{title}</span>
          <CollapsibleChevron />
        </CollapsibleTrigger>
        {action}
      </div>
      <CollapsibleContent>
        <div className={cn("flex flex-col gap-4 pt-3", contentClassName)}>
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  CollapsibleChevron,
  CollapsibleSection,
};
