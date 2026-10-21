import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Renders the same content in a dark and a light panel side by side; tokens resolve per panel. */
export default function ThemePanels({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      {(["dark", "light"] as const).map((theme) => (
        <div
          key={theme}
          data-theme={theme}
          className={cn(
            "bg-background text-foreground shadow-hairline flex min-w-0 flex-col gap-5 rounded-2xl p-4 sm:p-5",
            className,
          )}
        >
          <span className="eyebrow-style text-fg-tertiary">{theme}</span>
          {children}
        </div>
      ))}
    </div>
  );
}
