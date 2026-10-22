"use client";

import type { ComponentProps, ReactNode } from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import Kbd from "@/components/_ui/kbd";
import { cn } from "@/lib/utils";

export function TooltipProvider(
  props: ComponentProps<typeof TooltipPrimitive.Provider>,
) {
  return (
    <TooltipPrimitive.Provider
      delayDuration={400}
      skipDelayDuration={300}
      {...props}
    />
  );
}

type TooltipProps = {
  content: ReactNode;
  shortcut?: string;
  side?: ComponentProps<typeof TooltipPrimitive.Content>["side"];
  className?: string;
  /** Renders the trigger alone, e.g. when its label is already visible. */
  disabled?: boolean;
  children: ReactNode;
};

export default function Tooltip({
  content,
  shortcut,
  side = "bottom",
  className,
  disabled = false,
  children,
}: TooltipProps) {
  if (disabled) return children;
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            "bg-foreground text-background text-xs font-medium leading-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-[0.97] data-[state=instant-open]:animate-in data-[state=instant-open]:fade-in-0 z-overlay duration-fast flex origin-(--radix-tooltip-content-transform-origin) items-center gap-2 rounded-lg px-2 py-1.5 select-none [&_[data-slot=kbd]]:bg-background/15 [&_[data-slot=kbd]]:text-background/70 [&_[data-slot=kbd]]:shadow-none",
            className,
          )}
        >
          {content}
          {shortcut && <Kbd className="h-4 min-w-4 px-1">{shortcut}</Kbd>}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
