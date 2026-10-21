import type { ComponentType, SVGProps } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/_ui/button";
import CountBadge from "@/components/_ui/count-badge";
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
  tone?: "default" | "quiet";
};

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
  tone = "default",
}: SidebarNavItemProps) {
  const showCount = count !== undefined && count > 0;
  const className = cn(
    buttonVariants({ variant: "nav", size: "md" }),
    "group relative h-8 gap-1.5 py-0 font-normal",
    "collapsed:size-8 collapsed:justify-center collapsed:gap-0 collapsed:px-0",
    tone === "quiet" && "text-fg-tertiary",
  );
  const content = (
    <>
      <Icon
        aria-hidden
        className="text-fg-tertiary ease-power3-out group-hover:text-icon group-data-[active=true]:text-icon duration-fast size-3.5 shrink-0 transition-colors"
      />
      <span className="collapsed:sr-only min-w-0 flex-1 truncate text-left">
        {label}
      </span>
      {showCount && (
        <CountBadge className="collapsed:hidden">
          {alert && count > 99 ? "99+" : count}
          {countLabel && <span className="sr-only"> {countLabel}</span>}
        </CountBadge>
      )}
      {showCount && alert && (
        <span
          aria-hidden
          className="bg-danger ring-sidebar collapsed:block absolute top-1 right-1 hidden size-1.5 rounded-full ring-2"
        />
      )}
    </>
  );

  return (
    <li>
      <Tooltip
        content={label}
        shortcut={shortcut ? `G ${shortcut}` : undefined}
        side="right"
        disabled={!collapsed}
      >
        {href ? (
          <Link
            href={href}
            onClick={onClick}
            data-active={active}
            aria-current={active ? "page" : undefined}
            className={className}
          >
            {content}
          </Link>
        ) : (
          <button
            type="button"
            onClick={onClick}
            data-active={active}
            className={className}
          >
            {content}
          </button>
        )}
      </Tooltip>
    </li>
  );
}
