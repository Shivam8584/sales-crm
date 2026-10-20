"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import Button from "@/components/_ui/button";
import XIcon from "@/public/assets/icons/x.svg";

type SelectionBarProps = {
  count: number;
  noun: [singular: string, plural: string];
  onClear: () => void;
  children: ReactNode;
};

/** Floating actions for the rows currently selected in a list. */
export default function SelectionBar({
  count,
  noun,
  onClear,
  children,
}: SelectionBarProps) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          role="toolbar"
          aria-label="Selection actions"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
          className="bg-popover border-line-strong shadow-overlay z-floating absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border py-1 pr-1 pl-4"
        >
          <span className="caption-style text-foreground mr-2 whitespace-nowrap tabular-nums">
            {count} {count === 1 ? noun[0] : noun[1]} selected
          </span>
          {children}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Clear selection"
            onClick={onClear}
          >
            <XIcon aria-hidden className="size-3" />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
