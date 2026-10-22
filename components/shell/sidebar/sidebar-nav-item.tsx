"use client";

import type { ComponentType, SVGProps } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import Tooltip from "@/components/_ui/tooltip";
import { cn } from "@/lib/utils";

type SidebarNavItemProps = {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  /** Renders a link when set, otherwise a button. */
  href?: string;
  onClick?: () => void;
  active?: boolean;
  /** Key pressed after `G`, shown in the collapsed tooltip. */
  shortcut?: string;
  /** Tooltips only matter when the label is hidden. */
  collapsed?: boolean;
  count?: number;
  /** Read after the count by screen readers, e.g. "unread". */
  countLabel?: string;
  /** Shows a dot on the collapsed icon while the count is above zero. */
  alert?: boolean;
  /** Icon only, for the compact footer row. */
  iconOnly?: boolean;
  /** The active capsule slides between items sharing this id. */
  indicator?: string;
  tour?: string;
};

export const NAV_ITEM =
  "group relative flex h-9 min-w-9 items-center gap-3 overflow-hidden rounded-xl text-sm font-medium text-sidebar-foreground outline-none transition-[color,background-color,scale] duration-base ease-out select-none hover:text-foreground hover:duration-[120ms] active:scale-[0.97] motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:text-foreground not-data-[active=true]:hover:bg-overlay-2 pointer-coarse:h-11 pointer-coarse:min-w-11";

export default function SidebarNavItem({
  icon: Icon,
  label,
  href,
  onClick,
  active = false,
  shortcut,
  collapsed = false,
  count,
  countLabel,
  alert = false,
  iconOnly = false,
  indicator = "sidebar",
  tour,
}: SidebarNavItemProps) {
  const showCount = count !== undefined && count > 0;
  const className = cn(
    NAV_ITEM,
    iconOnly ? "justify-center px-0" : "w-full pr-3 pl-4",
  );
  const content = (
    <>
      {active && (
        <motion.span
          aria-hidden
          layoutId={`${indicator}-indicator`}
          transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
          className="bg-sidebar-primary shadow-capsule absolute inset-0 rounded-xl"
        />
      )}
      <span className="relative shrink-0">
        <Icon aria-hidden className="size-4" />
        {showCount && alert && (
          <span
            aria-hidden
            className="bg-foreground/40 collapsed:block absolute -top-0.5 -right-1 hidden size-1.5 rounded-full"
          />
        )}
      </span>
      {!iconOnly && (
        <span className="collapsed:pointer-events-none collapsed:-translate-x-1 collapsed:opacity-0 collapsed:delay-0 relative min-w-0 flex-1 truncate text-left whitespace-nowrap transition-[opacity,translate] delay-80 duration-160 ease-out">
          {label}
        </span>
      )}
      {showCount && !iconOnly && (
        <span className="text-fg-tertiary collapsed:opacity-0 relative text-xs font-normal tabular-nums transition-opacity delay-80 duration-160">
          {alert && count > 99 ? "99+" : count}
          {countLabel && <span className="sr-only"> {countLabel}</span>}
        </span>
      )}
    </>
  );

  return (
    <li className="relative">
      <Tooltip
        content={count ? `${label} · ${count}` : label}
        shortcut={shortcut ? `G ${shortcut}` : undefined}
        side="right"
        disabled={!collapsed && !iconOnly}
      >
        {href ? (
          <Link
            href={href}
            onClick={onClick}
            data-tour={tour}
            data-active={active}
            aria-current={active ? "page" : undefined}
            aria-label={iconOnly ? label : undefined}
            className={className}
          >
            {content}
          </Link>
        ) : (
          <button
            type="button"
            onClick={onClick}
            data-tour={tour}
            data-active={active}
            aria-label={iconOnly ? label : undefined}
            className={className}
          >
            {content}
          </button>
        )}
      </Tooltip>
    </li>
  );
}
