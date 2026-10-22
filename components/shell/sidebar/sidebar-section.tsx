import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A group of nav items; groups are told apart by a hairline, never a heading. */
export default function SidebarSection({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul
      aria-label={title}
      className={cn(
        "after:bg-foreground/[0.07] relative flex flex-col gap-0.5 px-3 pb-3 after:mx-4 after:mt-2.5 after:h-px",
        className,
      )}
    >
      {children}
    </ul>
  );
}
