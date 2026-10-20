"use client";

import { usePathname } from "next/navigation";
import { ScrollArea } from "@/components/_ui/scroll-area";
import Kbd from "@/components/_ui/kbd";
import { MOD_KEY } from "@/lib/keyboard";
import { useUiStore } from "@/stores/ui-store";
import Logo from "@/public/assets/images/_common/logo.svg";
import SearchIcon from "@/public/assets/icons/search.svg";
import { NAV_ITEMS, isActive } from "../navigation";
import SidebarNavItem from "./sidebar-nav-item";
import UserMenu from "./user-menu";

export default function SidebarContent() {
  const pathname = usePathname();
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  const setCommandOpen = useUiStore((state) => state.setCommandOpen);
  const close = () => setSidebarOpen(false);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-13 shrink-0 items-center gap-2.5 px-4">
        <Logo aria-hidden className="size-6 shrink-0 overflow-visible" />
        <span className="lead-style truncate font-medium tracking-[-0.01em]">
          Hypedrive
        </span>
      </div>

      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={() => {
            close();
            setCommandOpen(true);
          }}
          className="border-border bg-overlay-1 text-fg-tertiary hover:text-fg-secondary hover:bg-overlay-2 focus-visible:ring-ring duration-fast flex h-8 w-full items-center gap-2 rounded-md border px-2 text-sm leading-none transition-colors outline-none focus-visible:ring-2"
        >
          <SearchIcon aria-hidden className="size-3.5 shrink-0" />
          <span className="flex-1 text-left">Search</span>
          <span className="flex gap-0.5">
            <Kbd>{MOD_KEY}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="Primary" className="px-3 py-2">
          <ul className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => (
              <SidebarNavItem
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                active={isActive(pathname, item.href)}
                onNavigate={close}
              />
            ))}
          </ul>
        </nav>
      </ScrollArea>

      <div className="border-sidebar-border shrink-0 border-t p-2">
        <UserMenu />
      </div>
    </div>
  );
}
