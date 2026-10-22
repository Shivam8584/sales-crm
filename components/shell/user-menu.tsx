"use client";

import { useId, type ComponentType, type SVGProps } from "react";
import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import Divider from "@/components/_ui/divider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/_ui/dropdown-menu";
import Kbd from "@/components/_ui/kbd";
import { useTour } from "@/features/onboarding/tour-store";
import { useViewer } from "@/hooks/use-viewer";
import { ROLE_LABEL } from "@/lib/domain/labels";
import {
  setThemePreference,
  useThemePreference,
  type ThemePreference,
} from "@/lib/theme";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import { useUiStore } from "@/stores/ui-store";
import SunIcon from "@/public/assets/icons/sun.svg";
import MoonIcon from "@/public/assets/icons/moon.svg";
import MonitorIcon from "@/public/assets/icons/monitor.svg";
import SettingsIcon from "@/public/assets/icons/settings.svg";
import UsersIcon from "@/public/assets/icons/users.svg";
import KeyboardIcon from "@/public/assets/icons/message-question.svg";
import CursorClickIcon from "@/public/assets/icons/cursor-click.svg";
import LogOutIcon from "@/public/assets/icons/log-out.svg";

const THEMES = [
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
] as const;

const ITEM = "lead-style h-9 gap-3 px-2";

function MenuIcon({
  icon: Icon,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  return (
    <Icon
      aria-hidden
      className="text-fg-tertiary group-data-[highlighted]/item:text-icon duration-fast size-4 shrink-0 transition-colors"
    />
  );
}

/** Avatar pill in the page header: profile, theme, team, shortcuts and sign out. */
export default function UserMenu() {
  const router = useRouter();
  const viewer = useViewer();
  const theme = useThemePreference();
  const { signOut } = useAuthActions();
  const setShortcutsOpen = useUiStore((state) => state.setShortcutsOpen);
  const replayTour = useTour((state) => state.replay);
  const themeLabel = useId();

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
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[min(18.5rem,calc(100vw-1rem))] rounded-2xl"
        contentClassName="p-0"
      >
        <div className="flex items-center gap-3 p-3">
          <Avatar name={viewer.name} size="lg" className="rounded-xl" />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="lead-style truncate font-medium">
              {viewer.name}
            </span>
            <span className="caption-style text-fg-tertiary truncate">
              {ROLE_LABEL[viewer.role]} · {viewer.email}
            </span>
          </span>
        </div>
        <Divider />
        <div className="flex flex-col gap-0.5 p-2">
          <DropdownMenuItem
            className={cn(ITEM, "group/item")}
            onSelect={() => router.push(routes.profile)}
          >
            <MenuIcon icon={SettingsIcon} />
            <span className="flex-1">Profile settings</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className={cn(ITEM, "group/item")}
            onSelect={() => router.push(routes.team)}
          >
            <MenuIcon icon={UsersIcon} />
            <span className="flex-1">Team</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className={cn(ITEM, "group/item")}
            onSelect={() => setShortcutsOpen(true)}
          >
            <MenuIcon icon={KeyboardIcon} />
            <span className="flex-1">Keyboard shortcuts</span>
            <Kbd className="h-4 min-w-4 px-1">?</Kbd>
          </DropdownMenuItem>
          <DropdownMenuItem
            className={cn(ITEM, "group/item")}
            onSelect={replayTour}
          >
            <MenuIcon icon={CursorClickIcon} />
            <span className="flex-1">Replay product tour</span>
          </DropdownMenuItem>
        </div>
        <Divider />
        <div className="p-2">
          <div className="bg-overlay-1 shadow-well flex flex-col gap-1.5 rounded-xl p-1.5">
            <span
              id={themeLabel}
              className="caption-style text-fg-tertiary px-1.5 pt-1 font-medium"
            >
              Theme
            </span>
            <DropdownMenuPrimitive.RadioGroup
              aria-labelledby={themeLabel}
              value={theme}
              onValueChange={(value) =>
                setThemePreference(value as ThemePreference)
              }
              className="grid grid-cols-3 gap-1"
            >
              {THEMES.map((option) => (
                <DropdownMenuPrimitive.RadioItem
                  key={option.value}
                  value={option.value}
                  onSelect={(event) => event.preventDefault()}
                  className="caption-style text-fg-secondary data-[highlighted]:bg-overlay-2 data-[highlighted]:text-foreground data-[state=checked]:bg-secondary data-[state=checked]:text-foreground data-[state=checked]:shadow-raised duration-fast flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg font-medium transition-colors outline-none select-none pointer-coarse:h-11"
                >
                  <option.icon aria-hidden className="size-3.5" />
                  {option.label}
                </DropdownMenuPrimitive.RadioItem>
              ))}
            </DropdownMenuPrimitive.RadioGroup>
          </div>
        </div>
        <Divider />
        <div className="p-2">
          <DropdownMenuItem
            className={cn(ITEM, "group/item")}
            onSelect={() => void signOut()}
          >
            <MenuIcon icon={LogOutIcon} />
            <span className="flex-1">Sign out</span>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
