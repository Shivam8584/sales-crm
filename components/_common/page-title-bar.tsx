"use client";

import type { ReactNode } from "react";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import Tooltip from "@/components/_ui/tooltip";
import Notifications from "@/components/companies/header/notifications/notifications";
import ThemeMenu from "@/components/companies/header/theme-menu";
import { useCompaniesStore } from "@/stores/companies-store";
import MenuIcon from "@/public/assets/images/_common/menu.svg";
import SearchIcon from "@/public/assets/images/_common/search.svg";

const MOD_K =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Mac")
    ? "⌘K"
    : "Ctrl K";

type PageTitleBarProps = {
  title: string;
  badge?: ReactNode;
};

/** Top bar shared by every CRM page: navigation toggle, title and account actions. */
export default function PageTitleBar({ title, badge }: PageTitleBarProps) {
  const setSidebarOpen = useCompaniesStore((state) => state.setSidebarOpen);
  const setSearchOpen = useCompaniesStore((state) => state.setSearchOpen);
  const openProfile = useCompaniesStore((state) => state.openProfile);
  const viewer = useCompaniesStore((state) => state.viewer);
  const viewerName = viewer?.name ?? "";

  return (
    <div className="short:py-2 flex items-center justify-between gap-2 px-4 py-3.5 max-[359px]:gap-1">
      <div className="flex min-w-0 items-center gap-2 max-[359px]:gap-1.5">
        <Button
          variant="secondary"
          size="icon"
          className="lg:hidden"
          aria-label="Open navigation"
          onClick={() => setSidebarOpen(true)}
        >
          <MenuIcon aria-hidden className="size-3.5" />
        </Button>
        <h1 className="truncate">{title}</h1>
        {badge}
      </div>

      <div className="flex shrink-0 items-center gap-2 max-[359px]:gap-1 max-[359px]:[&_button]:after:-inset-x-0.5">
        <Tooltip content="Search" shortcut={MOD_K}>
          <Button
            variant="secondary"
            size="icon"
            aria-label="Search"
            aria-keyshortcuts="Meta+K Control+K"
            onClick={() => setSearchOpen(true)}
          >
            <SearchIcon aria-hidden className="size-3.5" />
          </Button>
        </Tooltip>
        <ThemeMenu />
        <Notifications />
        <Button
          variant="secondary"
          size="avatar"
          aria-label={viewer ? `Open profile for ${viewerName}` : "Profile"}
          disabled={!viewer}
          onClick={() => openProfile(viewerName)}
        >
          <Avatar src="" name={viewerName || "?"} alt="" />
          <span className="hidden max-w-40 truncate sm:inline">
            {viewerName || "Loading…"}
          </span>
        </Button>
      </div>
    </div>
  );
}
