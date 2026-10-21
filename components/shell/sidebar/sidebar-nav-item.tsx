import type { ComponentType, ReactNode, SVGProps } from "react";
import Link from "next/link";
import Tooltip from "@/components/_ui/tooltip";
import { cn } from "@/lib/utils";

type SidebarNavItemProps = {
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  active: boolean;
  /** Key pressed after `G`, shown in the collapsed tooltip. */
  shortcut?: string;
  /** Tooltips only matter when the label is hidden. */
  collapsed?: boolean;
  /** Small indicator after the label, e.g. an unread count. */
  badge?: ReactNode;
  onNavigate?: () => void;
};

export default function SidebarNavItem({
  href,
  icon: Icon,
  label,
  active,
  shortcut,
  collapsed = false,
  badge,
  onNavigate,
}: SidebarNavItemProps) {
  return (
    <li>
      <Tooltip
        content={label}
        shortcut={shortcut ? `G ${shortcut}` : undefined}
        side="right"
        disabled={!collapsed}
      >
        <Link
          href={href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          aria-label={collapsed ? label : undefined}
          className={cn(
            "group text-sidebar-foreground hover:bg-overlay-2 hover:text-foreground focus-visible:ring-ring duration-fast ease-power3-out relative flex h-8 items-center gap-2.5 rounded-md px-2 text-sm leading-none transition-colors outline-none focus-visible:ring-2",
            "collapsed:size-8 collapsed:justify-center collapsed:gap-0 collapsed:px-0",
            active &&
              "bg-sidebar-primary text-foreground shadow-raised hover:bg-sidebar-primary",
          )}
        >
          <Icon
            aria-hidden
            className={cn(
              "text-fg-tertiary group-hover:text-icon duration-fast size-3.5 shrink-0 transition-colors",
              active && "text-icon",
            )}
          />
          <span className="collapsed:sr-only min-w-0 flex-1 truncate">
            {label}
          </span>
          {badge}
        </Link>
      </Tooltip>
    </li>
  );
}
