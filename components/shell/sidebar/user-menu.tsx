"use client";

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

const THEMES = [
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
] as const;

export default function UserMenu() {
  const viewer = useViewer();
  const theme = useThemePreference();
  const { signOut } = useAuthActions();
  const setShortcutsOpen = useUiStore((state) => state.setShortcutsOpen);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="group hover:bg-overlay-1 data-[state=open]:bg-overlay-2 focus-visible:ring-ring duration-fast flex w-full items-center gap-2.5 rounded-md p-2 text-left transition-colors outline-none focus-visible:ring-2">
        <Avatar name={viewer.name} size="md" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="lead-style truncate font-medium">{viewer.name}</span>
          <span className="caption-style text-fg-tertiary truncate">
            {ROLE_LABEL[viewer.role]}
          </span>
        </span>
        <ChevronDownIcon
          aria-hidden
          className="text-fg-tertiary duration-base size-3 shrink-0 transition-transform group-data-[state=open]:rotate-180"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        className="w-(--radix-dropdown-menu-trigger-width)"
      >
        <DropdownMenuLabel className="truncate">
          {viewer.email}
        </DropdownMenuLabel>
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
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void signOut()}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
