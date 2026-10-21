"use client";

import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import Avatar from "@/components/_ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/_ui/dropdown-menu";
import Kbd from "@/components/_ui/kbd";
import { useViewer } from "@/hooks/use-viewer";
import { ROLE_LABEL } from "@/lib/domain/labels";
import {
  setThemePreference,
  useThemePreference,
  type ThemePreference,
} from "@/lib/theme";
import { useUiStore } from "@/stores/ui-store";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";
import SunIcon from "@/public/assets/icons/sun.svg";
import MoonIcon from "@/public/assets/icons/moon.svg";
import MonitorIcon from "@/public/assets/icons/monitor.svg";
import SettingsIcon from "@/public/assets/icons/settings.svg";

const THEMES = [
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
] as const;

export default function UserMenu({
  collapsed = false,
}: {
  collapsed?: boolean;
}) {
  const router = useRouter();
  const viewer = useViewer();
  const theme = useThemePreference();
  const { signOut } = useAuthActions();
  const setShortcutsOpen = useUiStore((state) => state.setShortcutsOpen);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${viewer.name}`}
        className="group hover:bg-overlay-2 data-[state=open]:bg-overlay-2 focus-visible:ring-ring duration-fast collapsed:size-8 collapsed:justify-center collapsed:p-0 flex w-full items-center gap-2.5 rounded-md p-2 text-left transition-colors outline-none focus-visible:ring-2"
      >
        <Avatar
          name={viewer.name}
          size="md"
          className="collapsed:size-6 collapsed:text-[10px]"
        />
        <span className="collapsed:hidden flex min-w-0 flex-1 flex-col gap-1">
          <span className="lead-style truncate font-medium">{viewer.name}</span>
          <span className="caption-style text-fg-tertiary truncate">
            {ROLE_LABEL[viewer.role]}
          </span>
        </span>
        <ChevronDownIcon
          aria-hidden
          className="text-fg-tertiary duration-base collapsed:hidden size-3 shrink-0 transition-transform group-data-[state=open]:rotate-180"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={collapsed ? "right" : "top"}
        align={collapsed ? "end" : "start"}
        className={
          collapsed ? "w-56" : "w-(--radix-dropdown-menu-trigger-width)"
        }
      >
        <DropdownMenuLabel className="truncate">
          {viewer.email}
        </DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={() => {
            setSidebarOpen(false);
            router.push("/settings/profile");
          }}
        >
          <SettingsIcon aria-hidden className="text-fg-tertiary size-3.5" />
          Profile settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) =>
            setThemePreference(value as ThemePreference)
          }
        >
          {THEMES.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <option.icon aria-hidden className="size-3.5" />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            setSidebarOpen(false);
            setShortcutsOpen(true);
          }}
        >
          Keyboard shortcuts
          <Kbd className="ml-auto h-4 min-w-4 px-1">?</Kbd>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void signOut()}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
