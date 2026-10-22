"use client";

import type { ComponentProps, KeyboardEvent } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/_ui/scroll-area";
import Button from "@/components/_ui/button";
import XIcon from "@/public/assets/icons/x.svg";

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

/** ⌘/Ctrl+Enter submits the dialog's form from any field, textareas included. */
function submitOnModEnter(event: KeyboardEvent<HTMLDivElement>) {
  if (event.defaultPrevented || event.key !== "Enter") return;
  if (!(event.metaKey || event.ctrlKey) || event.nativeEvent.isComposing) {
    return;
  }
  const target = event.target instanceof Element ? event.target : null;
  const form =
    target?.closest("form") ?? event.currentTarget.querySelector("form");
  if (!form) return;
  event.preventDefault();
  form.requestSubmit();
}

function Dialog(props: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:ease-power3-in data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:ease-power3-out z-overlay bg-scrim duration-slow data-[state=closed]:duration-base fixed inset-0",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        {...props}
        onPointerDownOutside={(event) => {
          keepOpenForToasts(event);
          props.onPointerDownOutside?.(event);
        }}
        onInteractOutside={(event) => {
          keepOpenForToasts(event);
          props.onInteractOutside?.(event);
        }}
        onKeyDown={(event) => {
          props.onKeyDown?.(event);
          submitOnModEnter(event);
        }}
        className={cn(
          "bg-popover text-popover-foreground data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97] data-[state=closed]:ease-power3-in data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] data-[state=open]:slide-in-from-bottom-4 data-[state=open]:ease-out-hd z-overlay shadow-overlay data-[state=open]:duration-[480ms] data-[state=closed]:duration-fast fixed top-1/2 left-1/2 flex w-[calc(100%-2rem)] max-w-120 -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl outline-none",
          className,
        )}
      >
        <ScrollArea viewportClassName="max-h-[calc(100dvh-2rem)]">
          {children}
        </ScrollArea>
        <DialogPrimitive.Close asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="z-sticky-header bg-well text-fg-secondary hover:bg-well-hover absolute top-5 right-5"
            aria-label="Close"
          >
            <XIcon className="size-4" />
          </Button>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "bg-popover z-sticky sticky top-0 flex flex-col gap-1.5 px-6 pt-6 pb-4",
        className,
      )}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "bg-popover z-sticky sticky bottom-0 flex items-center justify-end gap-2 px-6 pt-4 pb-6",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("pr-10 text-xl leading-7 font-semibold tracking-[-0.02em]", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-fg-secondary text-sm text-pretty", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
