"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import Kbd from "@/components/_ui/kbd";
import { ROLE_DESCRIPTION } from "@/features/team/roles";
import { useViewer } from "@/hooks/use-viewer";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { cleanText } from "@/lib/domain/normalize";
import { readError } from "@/lib/errors";
import { MOD_KEY } from "@/lib/keyboard";
import { setThemePreference, useThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { useUiStore } from "@/stores/ui-store";
import MonitorIcon from "@/public/assets/icons/monitor.svg";
import MoonIcon from "@/public/assets/icons/moon.svg";
import SunIcon from "@/public/assets/icons/sun.svg";
import { SettingsRow, SettingsSection, SettingsTitle } from "./settings-ui";

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
      <SettingsTitle
        title="Profile"
        description="How you appear to your team, and how the CRM looks for you."
      />

      <SettingsSection title="Account">
        <NameRow key={viewer.name} name={viewer.name} />
        <SettingsRow
          label="Email"
          description="Used to sign in. Ask an admin to move you to a new address."
        >
          <span className="lead-style text-fg-secondary truncate sm:max-w-64">
            {viewer.email}
          </span>
        </SettingsRow>
        <SettingsRow label="Role" description={ROLE_DESCRIPTION[viewer.role]}>
          <span className="lead-style text-fg-secondary">
            {ROLE_LABEL[viewer.role]}
          </span>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Appearance">
        <SettingsRow
          label="Theme"
          description="System follows your device's light or dark setting."
        >
          <ThemePicker />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Keyboard shortcuts"
        actions={
          <Button
            variant="subtle"
            size="xs"
            onClick={() => setShortcutsOpen(true)}
          >
            View all
            <Kbd className="h-4 min-w-4 px-1">?</Kbd>
          </Button>
        }
      >
        <ul className="divide-border flex flex-col divide-y">
          {SHORTCUTS.map((item) => (
            <li
              key={item.label}
              className="flex h-11 items-center justify-between gap-4 px-4"
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

      <SettingsSection title="Session">
        <SettingsRow
          label="Sign out"
          description="Ends your session in this browser."
        >
          <Button variant="subtle" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </SettingsRow>
      </SettingsSection>
    </>
  );
}

function NameRow({ name }: { name: string }) {
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
      <SettingsRow
        label="Display name"
        htmlFor="profile-name"
        description="Shown on records you own, in the timeline and in mentions."
        className="sm:items-start"
      >
        <div className="flex w-full flex-col gap-2 sm:w-72">
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
              aria-describedby={error ? "profile-name-error" : undefined}
              className="aria-invalid:border-danger"
            />
            <Button
              type="submit"
              variant={dirty ? "primary" : "subtle"}
              size="control"
              className="px-3.5"
              disabled={!dirty}
              loading={saving}
            >
              Save
            </Button>
          </div>
          {error && (
            <span
              id="profile-name-error"
              role="alert"
              className="caption-style text-danger leading-snug"
            >
              {error}
            </span>
          )}
        </div>
      </SettingsRow>
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
      className="bg-muted flex w-full rounded-lg p-0.5 sm:w-auto"
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
              "focus-visible:ring-ring duration-fast flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-2 sm:flex-none",
              checked
                ? "bg-card text-foreground shadow-raised"
                : "text-fg-secondary hover:text-foreground",
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
