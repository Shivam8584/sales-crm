"use client";

import type { ComponentProps } from "react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/_ui/scroll-area";

function DropdownMenu(
  props: ComponentProps<typeof DropdownMenuPrimitive.Root>,
) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger(
  props: ComponentProps<typeof DropdownMenuPrimitive.Trigger>,
) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  );
}

function DropdownMenuContent({
  className,
  contentClassName,
  sideOffset = 6,
  align = "start",
  collisionPadding = 8,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content> & {
  /** Classes for the padded inner list, e.g. `p-0` for sectioned menus. */
  contentClassName?: string;
}) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        collisionPadding={collisionPadding}
        className={cn(
          "bg-popover text-popover-foreground data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97] data-[state=closed]:ease-power3-in data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 data-[state=open]:ease-power3-out z-overlay shadow-overlay duration-base data-[state=closed]:duration-fast min-w-42 origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-xl",
          className,
        )}
        {...props}
      >
        <ScrollArea viewportClassName="max-h-[min(360px,var(--radix-dropdown-menu-content-available-height))]">
          <div className={cn("p-1", contentClassName)}>{children}</div>
        </ScrollArea>
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        "caption-style text-foreground ease-power3-out duration-fast data-[highlighted]:bg-overlay-2 relative flex min-h-8 cursor-pointer items-center gap-2 rounded-lg px-2 py-2 transition-colors outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 pointer-coarse:min-h-11",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuRadioGroup(
  props: ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>,
) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  );
}

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(
        "caption-style text-fg-secondary ease-power3-out data-[highlighted]:text-foreground data-[state=checked]:text-foreground duration-fast data-[highlighted]:bg-overlay-2 relative flex min-h-8 cursor-pointer items-center gap-2 rounded-lg py-2 pr-2 pl-6 transition-colors outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 pointer-coarse:min-h-11",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-2 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <span className="bg-selected block size-1.5 rounded-full" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      className={cn("caption-style text-fg-tertiary px-2 py-1.5", className)}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("bg-border -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
};
