"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import Kbd from "@/components/_ui/kbd";
import { Switch } from "@/components/_ui/switch";
import Tag from "@/components/_ui/tag";
import Tooltip from "@/components/_ui/tooltip";
import { Card, CardHeader } from "@/components/_ui/card";
import { Properties, Property } from "@/components/record";
import { PageStatus } from "@/components/shell/page";
import { useInstallPrompt } from "@/features/pwa/use-install-prompt";
import { usePush } from "@/features/pwa/use-push";
import { ROLE_DESCRIPTION, ROLE_TONE } from "@/features/team/roles";
import { useViewer } from "@/hooks/use-viewer";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { cleanText } from "@/lib/domain/normalize";
import { readError } from "@/lib/errors";
import { MOD_KEY } from "@/lib/keyboard";
import { setThemePreference, useThemePreference } from "@/lib/theme";
import { dateTime, shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { DigestSetting } from "@/features/notifications/digest-setting";
import { toast } from "@/stores/toast-store";
import { useUiStore } from "@/stores/ui-store";
import MonitorIcon from "@/public/assets/icons/monitor.svg";
import MoonIcon from "@/public/assets/icons/moon.svg";
import SunIcon from "@/public/assets/icons/sun.svg";
import { SettingsRow, SettingsSection } from "./settings-ui";

const MAX_NAME = 80;

const THEMES = [
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
] as const;

const SHORTCUTS = [
  { keys: [MOD_KEY, "K"], label: "Search and run commands" },
  { keys: ["G", "L"], label: "Go to a page, e.g. leads" },
  { keys: ["C"], label: "Create a record" },
  { keys: [MOD_KEY, "Z"], label: "Undo the last action" },
  { keys: ["J", "K"], label: "Move through a list" },
  { keys: ["?"], label: "Show every shortcut" },
];

/** /settings/profile: your name, theme, shortcuts and sign out. */
export default function ProfileSettings() {
  const viewer = useViewer();
  const { signOut } = useAuthActions();
  const setShortcutsOpen = useUiStore((state) => state.setShortcutsOpen);

  return (
    <>
      <Card aria-labelledby="profile-title">
        <CardHeader
          id="profile-title"
          visual={
            <Avatar name={viewer.name} size="lg" className="rounded-xl" />
          }
          title={viewer.name}
          meta={
            <>
              <Tag tone={ROLE_TONE[viewer.role]} size="xs">
                {ROLE_LABEL[viewer.role]}
              </Tag>
              <PageStatus>Active</PageStatus>
            </>
          }
          description={viewer.email}
        />
        <div className="flex flex-col gap-5 px-4 py-5 sm:px-5">
          <NameField key={viewer.name} name={viewer.name} />
          <Properties>
            <Property label="Email">
              <span
                className="text-fg-secondary truncate text-sm"
                title={viewer.email}
              >
                {viewer.email}
              </span>
            </Property>
            <Property label="Role">
              <span className="text-fg-secondary truncate text-sm">
                {ROLE_DESCRIPTION[viewer.role]}
              </span>
            </Property>
            <Property label="Member since">
              <Tooltip content={dateTime(viewer.joinedAt)}>
                <span tabIndex={0} className="rounded-sm text-sm">
                  {shortDate(viewer.joinedAt)}
                </span>
              </Tooltip>
            </Property>
          </Properties>
        </div>
      </Card>

      <SettingsSection
        title="Appearance"
        description="How the CRM looks on this device."
      >
        <SettingsRow
          label="Theme"
          description="System follows your device's light or dark setting."
        >
          <ThemePicker />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Keyboard shortcuts"
        description="The few worth learning first."
        action={
          <Button
            variant="secondary"
            size="xs"
            onClick={() => setShortcutsOpen(true)}
          >
            View all
            <Kbd className="h-4 min-w-4 px-1">?</Kbd>
          </Button>
        }
      >
        <ul aria-label="Common shortcuts" className="flex flex-col">
          {SHORTCUTS.map((item) => (
            <li
              key={item.label}
              className="border-border flex h-11 items-center justify-between gap-4 border-t px-4 sm:px-5"
            >
              <span className="lead-style text-fg-secondary truncate">
                {item.label}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {item.keys.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </SettingsSection>

      <SettingsSection title="Notifications & app">
        <PushRow />
        <InstallRow />
        <DigestSetting />
      </SettingsSection>

      <SettingsSection title="Session">
        <SettingsRow
          label="Sign out"
          description="Ends your session in this browser."
        >
          <Button variant="secondary" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </SettingsRow>
      </SettingsSection>
    </>
  );
}

function PushRow() {
  const push = usePush();
  const description = !push.supported
    ? "Not supported in this browser"
    : push.permission === "denied"
      ? "Blocked in browser settings"
      : push.publicKey === null
        ? "Not set up on this server"
        : "Get alerts on this device when something needs you.";

  return (
    <SettingsRow
      label="Push notifications"
      htmlFor="push-notifications"
      description={description}
    >
      <Switch
        id="push-notifications"
        checked={push.subscribed}
        disabled={
          !push.supported ||
          push.permission === "denied" ||
          !push.publicKey ||
          push.pending
        }
        onCheckedChange={(checked) =>
          void (checked ? push.enable() : push.disable())
        }
      />
    </SettingsRow>
  );
}

function InstallRow() {
  const { canInstall, install } = useInstallPrompt();
  if (!canInstall) return null;
  return (
    <SettingsRow
      label="Install app"
      description="Open Hypedrive CRM in its own window from your home screen or dock."
    >
      <Button variant="secondary" size="sm" onClick={() => void install()}>
        Install
      </Button>
    </SettingsRow>
  );
}

function NameField({ name }: { name: string }) {
  const update = useMutation(api.members.updateProfile);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const dirty = (cleanText(value) ?? "") !== name;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next = cleanText(value);
    if (!next) return setError("Enter your name");
    if (next.length > MAX_NAME) {
      return setError(`Keep it under ${MAX_NAME} characters`);
    }
    if (next === name) return;
    setSaving(true);
    setError(undefined);
    try {
      const previous = await update({ name: next });
      toast("Name updated", () => {
        update({ name: previous.name }).catch((reason) =>
          toast(readError(reason).message, { tone: "danger" }),
        );
      });
    } catch (reason) {
      setError(readError(reason, "Couldn't save your name").message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <Field
        label="Display name"
        htmlFor="profile-name"
        error={error}
        hint="Shown on records you own, in the timeline and in mentions."
      >
        <div className="flex gap-2">
          <Input
            id="profile-name"
            value={value}
            maxLength={MAX_NAME + 20}
            autoComplete="name"
            onChange={(event) => {
              setValue(event.target.value);
              setError(undefined);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && dirty) {
                event.stopPropagation();
                setValue(name);
                setError(undefined);
              }
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={
              error ? "profile-name-error" : "profile-name-hint"
            }
            className="aria-invalid:border-danger"
          />
          <Button
            type="submit"
            variant={dirty ? "primary" : "secondary"}
            size="control"
            className="h-9 px-4"
            disabled={!dirty}
            loading={saving}
          >
            Save
          </Button>
        </div>
      </Field>
    </form>
  );
}

function ThemePicker() {
  const theme = useThemePreference();

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const index = THEMES.findIndex((option) => option.value === theme);
    const next = (index + step + THEMES.length) % THEMES.length;
    setThemePreference(THEMES[next].value);
    event.currentTarget
      .querySelectorAll<HTMLButtonElement>("[role=radio]")
      [next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      onKeyDown={onKeyDown}
      className="flex w-full flex-wrap gap-1.5 sm:w-auto"
    >
      {THEMES.map((option) => {
        const checked = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => setThemePreference(option.value)}
            className={cn(
              "focus-visible:ring-ring duration-fast ease-power3-out flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full border px-3 text-xs leading-none font-medium transition-[background-color,border-color,color] outline-none focus-visible:ring-2 sm:flex-none",
              checked
                ? "border-selected bg-overlay-1 text-foreground"
                : "border-input text-fg-secondary hover:bg-overlay-1 hover:text-foreground",
            )}
          >
            <option.icon aria-hidden className="size-3.5" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
