"use client";

import { useState, type FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import Kbd from "@/components/_ui/kbd";
import SegmentedControl from "@/components/_ui/segmented-control";
import { Switch } from "@/components/_ui/switch";
import Tooltip from "@/components/_ui/tooltip";
import { useInstallPrompt } from "@/features/pwa/use-install-prompt";
import { usePush } from "@/features/pwa/use-push";
import { useViewer } from "@/hooks/use-viewer";
import { ROLE_DESCRIPTION } from "@/features/team/roles";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { cleanText, formatPhone, normalizePhone } from "@/lib/domain/normalize";
import { readError } from "@/lib/errors";
import { MOD_KEY } from "@/lib/keyboard";
import {
  setThemePreference,
  useThemePreference,
  type ThemePreference,
} from "@/lib/theme";
import { dateTime, shortDate } from "@/lib/time";
import { DigestSetting } from "@/features/notifications/digest-setting";
import { toast } from "@/stores/toast-store";
import { useUiStore } from "@/stores/ui-store";
import ApiTokens from "./api-tokens";
import { SettingsRow, SettingsSection } from "./settings-ui";

const MAX_NAME = 80;

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const SHORTCUTS = [
  { keys: [MOD_KEY, "K"], label: "Search and run commands" },
  { keys: ["G", "L"], label: "Go to a page, e.g. leads" },
  { keys: ["C"], label: "Create a record" },
  { keys: [MOD_KEY, "Z"], label: "Undo the last action" },
  { keys: ["J", "K"], label: "Move through a list" },
];

/** /settings/profile: your name, theme, shortcuts and sign out. */
export default function ProfileSettings() {
  const viewer = useViewer();
  const { signOut } = useAuthActions();
  const setShortcutsOpen = useUiStore((state) => state.setShortcutsOpen);
  const theme = useThemePreference();

  return (
    <>
      <SettingsSection title="Profile">
        <NameField key={viewer.name} name={viewer.name} />
        <SettingsRow label="Email">
          <span className="lead-style text-fg-secondary truncate">
            {viewer.email}
          </span>
        </SettingsRow>
        <SettingsRow label="Role" description={ROLE_DESCRIPTION[viewer.role]}>
          <span className="lead-style text-fg-secondary">
            {ROLE_LABEL[viewer.role]}
          </span>
        </SettingsRow>
        <SettingsRow label="Member since">
          <Tooltip content={dateTime(viewer.joinedAt)}>
            <span
              tabIndex={0}
              className="lead-style text-fg-secondary rounded-sm"
            >
              {shortDate(viewer.joinedAt)}
            </span>
          </Tooltip>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Appearance">
        <SettingsRow
          label="Theme"
          description="System follows your device's setting."
        >
          <SegmentedControl
            label="Theme"
            value={theme}
            onChange={(next) => setThemePreference(next as ThemePreference)}
            segments={THEMES}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Keyboard shortcuts"
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
              className="border-border flex h-11 items-center justify-between gap-4 border-t"
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

      <SettingsSection title="Notifications">
        <PushRow />
        <InstallRow />
        <DigestSetting />
      </SettingsSection>

      <CallingSection />

      <ApiTokens />

      <SettingsSection title="Session">
        <SettingsRow label="Sign out on this device">
          <Button variant="secondary" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </SettingsRow>
      </SettingsSection>
    </>
  );
}

function CallingSection() {
  const configured = useQuery(api.calls.configured);
  const viewer = useViewer();
  const setPhone = useMutation(api.members.setPhone);
  const saved = viewer.phone ? formatPhone(viewer.phone) : "";
  const [value, setValue] = useState(saved);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  if (!configured) return null;

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      await setPhone({ phone: value });
      const phone = normalizePhone(value);
      setValue(phone ? formatPhone(phone) : "");
      toast(phone ? "Phone saved" : "Phone removed");
    } catch (reason) {
      setError(readError(reason, "Couldn't save your phone").message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsSection title="Calling">
      <SettingsRow
        label="Your phone"
        htmlFor="profile-phone"
        description={
          error ? (
            <span role="alert" className="text-danger">
              {error}
            </span>
          ) : (
            "Call from the CRM rings this number first, then connects the customer."
          )
        }
      >
        <form onSubmit={save} noValidate className="flex gap-2">
          <Input
            id="profile-phone"
            type="tel"
            autoComplete="tel"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError(undefined);
            }}
            placeholder="98200 12345"
            aria-invalid={error ? true : undefined}
            className="aria-invalid:border-danger"
          />
          <Button
            type="submit"
            variant="secondary"
            size="control"
            className="h-9 px-4"
            disabled={value.trim() === saved}
            loading={saving}
          >
            Save
          </Button>
        </form>
      </SettingsRow>
    </SettingsSection>
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
      <SettingsRow
        label="Display name"
        htmlFor="profile-name"
        description={
          error ? (
            <span id="profile-name-error" role="alert" className="text-danger">
              {error}
            </span>
          ) : (
            "Shown on records you own, in the timeline and in mentions."
          )
        }
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
            aria-describedby={error ? "profile-name-error" : undefined}
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
      </SettingsRow>
    </form>
  );
}
