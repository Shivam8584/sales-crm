import type { ComponentType, ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "bg-well flex flex-col items-center rounded-3xl px-8 py-12 text-center",
        className,
      )}
    >
      {Icon && (
        <span className="bg-background text-fg-secondary shadow-tile mb-4 grid size-11 place-items-center rounded-full">
          <Icon aria-hidden className="size-4" />
        </span>
      )}
      <span className="title-style block text-balance">{title}</span>
      {description && (
        <span className="text-fg-secondary mt-1 block max-w-[40ch] text-sm text-pretty">
          {description}
        </span>
      )}
      {action && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>
      )}
    </div>
  );
}
