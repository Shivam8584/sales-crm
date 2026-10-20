"use client";

import { useCallback, type KeyboardEvent, type ReactNode } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { motion } from "motion/react";
import { wasJustDragged } from "./board-drag";
import { cn } from "@/lib/utils";

type CardSurfaceProps = {
  lifted?: boolean;
  invisible?: boolean;
  className?: string;
  children: ReactNode;
};

export function CardSurface({
  lifted = false,
  invisible = false,
  className,
  children,
}: CardSurfaceProps) {
  return (
    <div
      className={cn(
        "bg-card shadow-card relative flex w-full flex-col gap-2.5 rounded-xl p-3",
        lifted &&
          "shadow-overlay ring-selected/40 animate-card-lift -rotate-3 ring-2 motion-reduce:animate-none",
        invisible && "invisible",
        className,
      )}
    >
      {children}
    </div>
  );
}

type BoardCardProps = {
  id: string;
  columnId: string;
  label: string;
  hidden?: boolean;
  animateLayout?: boolean;
  onOpen: (id: string) => void;
  children: ReactNode;
};

export default function BoardCard({
  id,
  columnId,
  label,
  hidden = false,
  animateLayout = true,
  onOpen,
  children,
}: BoardCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id });
  const { setNodeRef: setDropRef } = useDroppable({
    id: `card:${id}`,
    disabled: hidden,
    data: { columnId },
  });

  const setRef = useCallback(
    (node: HTMLElement | null) => {
      setDragRef(node);
      setDropRef(node);
    },
    [setDragRef, setDropRef],
  );

  const open = () => {
    if (!wasJustDragged()) onOpen(id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter") {
      event.preventDefault();
      open();
      return;
    }
    // This handler replaces dnd-kit's, so forward Space to pick the card up.
    listeners?.onKeyDown?.(event);
  };

  return (
    <motion.div
      layout="position"
      transition={{
        layout: animateLayout
          ? { type: "spring", duration: 0.3, bounce: 0 }
          : { duration: 0 },
      }}
    >
      <div
        ref={setRef}
        {...listeners}
        {...attributes}
        data-board-card={hidden ? undefined : id}
        aria-label={`Open ${label}`}
        aria-roledescription="draggable card"
        onClick={open}
        onKeyDown={onKeyDown}
        className={cn(
          "focus-visible:ring-ring cursor-grab touch-manipulation rounded-xl outline-none focus-visible:ring-2",
          isDragging && "cursor-grabbing",
        )}
      >
        <CardSurface
          invisible={hidden}
          className="hover:bg-raised duration-fast ease-power3-out transition-colors"
        >
          {children}
        </CardSurface>
      </div>
    </motion.div>
  );
}
