import type { ComponentType, SVGProps } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type SidebarNavItemProps = {
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  active: boolean;
  onNavigate?: () => void;
};

export default function SidebarNavItem({
  href,
  icon: Icon,
  label,
  active,
  onNavigate,
}: SidebarNavItemProps) {
  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group text-sidebar-foreground hover:bg-overlay-1 hover:text-foreground focus-visible:ring-ring duration-fast ease-power3-out flex h-8 items-center gap-2 rounded-md px-2 text-sm leading-none transition-colors outline-none focus-visible:ring-2",
          active && "bg-sidebar-primary text-foreground shadow-raised",
        )}
      >
        <Icon
          aria-hidden
          className={cn(
            "text-fg-tertiary group-hover:text-icon duration-fast size-3.5 shrink-0 transition-colors",
            active && "text-icon",
          )}
        />
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </Link>
    </li>
  );
}
