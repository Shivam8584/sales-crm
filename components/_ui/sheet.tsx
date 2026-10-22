"use client";

import type { ComponentProps, ComponentType, SVGProps } from "react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/** Clicking a toast (e.g. Undo) must not count as clicking outside the overlay. */
function keepOpenForToasts(event: {
  target: EventTarget | null;
  preventDefault: () => void;
}) {
  if (
    event.target instanceof Element &&
    event.target.closest("[data-toaster]")
  ) {
    event.preventDefault();
  }
}

function Sheet(props: ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(props: ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:ease-power3-in data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:ease-power3-out z-overlay bg-scrim duration-panel data-[state=closed]:duration-slow fixed inset-0",
        className,
      )}
      {...props}
    />
  );
}

type SheetContentProps = ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "left" | "right" | "bottom";
};

function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: SheetContentProps) {
  return (
    <SheetPrimitive.Portal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        {...props}
        onPointerDownOutside={(event) => {
          keepOpenForToasts(event);
          props.onPointerDownOutside?.(event);
        }}
        onInteractOutside={(event) => {
          keepOpenForToasts(event);
          props.onInteractOutside?.(event);
        }}
        className={cn(
          "bg-background text-foreground data-[state=closed]:animate-out data-[state=closed]:ease-power3-in data-[state=open]:animate-in data-[state=open]:ease-out-hd z-overlay data-[state=closed]:duration-slow fixed flex w-full flex-col overflow-hidden outline-none data-[state=open]:duration-[480ms]",
          side === "right" &&
            "shadow-overlay data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-dvh sm:inset-y-2 sm:right-2 sm:h-[calc(100dvh-1rem)] sm:max-w-[calc(100vw-1rem)] sm:rounded-3xl",
          side === "left" &&
            "shadow-overlay data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-dvh sm:inset-y-2 sm:left-2 sm:h-[calc(100dvh-1rem)] sm:rounded-3xl",
          side === "bottom" &&
            "shadow-overlay data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom rounded-t-5xl inset-x-0 bottom-0 max-h-[85dvh]",
          className,
        )}
      >
        {children}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        "flex h-16 shrink-0 items-center justify-between gap-2 px-6",
        className,
      )}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "border-border flex h-17 shrink-0 items-center justify-between gap-2 border-t px-6",
        className,
      )}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  icon: Icon,
  children,
  ...props
}: ComponentProps<typeof SheetPrimitive.Title> & {
  /** Leading icon, as in "🏢 Account details". */
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "title-style min-w-0 truncate",
        Icon && "flex items-center gap-2",
        className,
      )}
      {...props}
    >
      {Icon && <Icon aria-hidden className="text-icon size-3.5 shrink-0" />}
      {children}
    </SheetPrimitive.Title>
  );
}

function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-fg-secondary text-sm", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
