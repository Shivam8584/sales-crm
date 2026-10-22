"use client";

import {
  useCallback,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
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
        "bg-background shadow-tile relative flex w-full flex-col overflow-clip rounded-2xl",
        lifted &&
          "shadow-overlay animate-card-lift -rotate-2 motion-reduce:animate-none",
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
  onPeek?: (id: string) => void;
  children: ReactNode;
};

export default function BoardCard({
  id,
  columnId,
  label,
  hidden = false,
  animateLayout = true,
  onOpen,
  onPeek,
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

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (wasJustDragged()) return;
    if (onPeek && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
      onPeek(id);
    } else {
      onOpen(id);
    }
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
        onClick={onClick}
        onKeyDown={onKeyDown}
        className={cn(
          "group/card focus-visible:ring-ring cursor-grab touch-manipulation rounded-2xl outline-none focus-visible:ring-2",
          isDragging && "cursor-grabbing",
        )}
      >
        <CardSurface
          invisible={hidden}
          className="duration-base ease-out-hd group-hover/card:shadow-lift transition-[translate,box-shadow,scale] group-hover/card:-translate-y-0.5 group-active/card:scale-[0.985] motion-reduce:group-hover/card:translate-y-0"
        >
          {children}
        </CardSurface>
      </div>
    </motion.div>
  );
}
