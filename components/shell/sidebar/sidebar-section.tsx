import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
    <div
      className={cn(
        "collapsed:items-center collapsed:px-2 flex flex-col gap-1 p-3",
        className,
      )}
    >
      {title && (
        <h2 className="eyebrow-style text-fg-tertiary collapsed:sr-only block px-2 py-1 font-medium">
          {title}
        </h2>
      )}
      <ul className="collapsed:items-center flex flex-col gap-px">
        {children}
      </ul>
    </div>
  );
}
