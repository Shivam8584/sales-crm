"use client";

import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import BuildingIcon from "@/public/assets/icons/building.svg";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import UsersIcon from "@/public/assets/icons/users.svg";
import ClipboardIcon from "@/public/assets/icons/clipboard.svg";
import SidebarNavItem from "./sidebar-nav-item";

const ICON = {
  accounts: BuildingIcon,
  people: UsersIcon,
  leads: TargetIcon,
  deals: ClipboardIcon,
} as const;

/** Records the member pinned from a record page's actions menu. */
export default function SidebarPins({
  collapsed,
  onNavigate,
  indicator,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  indicator?: string;
}) {
  const pathname = usePathname();
  const pins = useQuery(api.pins.mine, {});
  if (!pins?.length) return null;
  return (
    <div className="pt-6">
      <p className="text-fg-tertiary collapsed:sr-only px-7 pb-1 text-xs">
        Pinned
      </p>
      <ul aria-label="Pinned" className="flex flex-col gap-0.5 px-3">
        {pins.map((pin) => (
          <SidebarNavItem
            key={pin._id}
            href={pin.href}
            icon={ICON[pin.record.split(":")[0] as keyof typeof ICON]}
            label={pin.title}
            collapsed={collapsed}
            active={pathname === pin.href}
            onClick={onNavigate}
            indicator={`${indicator ?? "sidebar"}-pin`}
          />
        ))}
      </ul>
    </div>
  );
}
