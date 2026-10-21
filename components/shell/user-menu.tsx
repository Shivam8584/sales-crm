"use client";

import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
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
import SunIcon from "@/public/assets/icons/sun.svg";
import MoonIcon from "@/public/assets/icons/moon.svg";
import MonitorIcon from "@/public/assets/icons/monitor.svg";
import SettingsIcon from "@/public/assets/icons/settings.svg";

const THEMES = [
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
] as const;

/** Avatar pill in the page header: profile, theme, shortcuts and sign out. */
export default function UserMenu() {
  const router = useRouter();
  const viewer = useViewer();
  const theme = useThemePreference();
  const { signOut } = useAuthActions();
  const setShortcutsOpen = useUiStore((state) => state.setShortcutsOpen);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="avatar"
          aria-label={`Account menu for ${viewer.name}`}
          className="data-[state=open]:bg-muted max-sm:size-control-md max-sm:p-0"
        >
          <Avatar name={viewer.name} />
          <span className="max-w-32 truncate max-sm:hidden">{viewer.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <Avatar name={viewer.name} size="md" />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="lead-style truncate font-medium">
              {viewer.name}
            </span>
            <span className="caption-style text-fg-tertiary truncate">
              {ROLE_LABEL[viewer.role]} · {viewer.email}
            </span>
          </span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/settings/profile")}>
          <SettingsIcon aria-hidden className="text-fg-tertiary size-3.5" />
          Profile settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
          Keyboard shortcuts
          <Kbd className="ml-auto h-4 min-w-4 px-1">?</Kbd>
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
        <DropdownMenuItem onSelect={() => void signOut()}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
