import type { ComponentType, SVGProps } from "react";
import Button from "@/components/_ui/button";
import CountBadge from "@/components/_ui/count-badge";
import { cn } from "@/lib/utils";

type SidebarNavItemProps = {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  count?: number;
  active?: boolean;
  tone?: "default" | "quiet";
  iconClassName?: string;
};

export default function SidebarNavItem({
  icon: Icon,
  label,
  count,
  active = false,
  tone = "default",
  iconClassName,
}: SidebarNavItemProps) {
  return (
    <li className={cn(active && "mb-0.75")}>
      <Button
        variant="nav"
        size="md"
        data-active={active}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group h-control-md gap-1.5 py-0 data-[active=true]:h-8",
          tone === "quiet" && "text-fg-tertiary",
        )}
      >
        <Icon
          aria-hidden
          className={cn(
            "text-fg-tertiary ease-power3-out group-hover:text-icon group-data-[active=true]:text-icon duration-fast size-3.5 shrink-0 transition-colors",
            iconClassName,
          )}
        />
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        {count !== undefined && <CountBadge>{count}</CountBadge>}
      </Button>
    </li>
  );
}
