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
        "flex flex-col items-center gap-2 px-6 py-10 text-center",
        className,
      )}
    >
      {Icon && <Icon aria-hidden className="text-fg-tertiary mb-1 size-4" />}
      <span className="lead-style block font-medium text-balance">{title}</span>
      {description && (
        <span className="caption-style text-fg-tertiary block max-w-sm leading-snug text-balance">
          {description}
        </span>
      )}
      {action && (
        <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>
      )}
    </div>
  );
}
