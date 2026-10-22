"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import { Checkbox } from "@/components/_ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/_ui/dialog";
import Field from "@/components/_ui/field";
import { Switch } from "@/components/_ui/switch";
import { Textarea } from "@/components/_ui/textarea";
import {
  SettingsRow,
  SettingsSection,
  SettingsSkeleton,
} from "@/features/settings/settings-ui";
import { readError } from "@/lib/errors";
import { relativeTime } from "@/lib/time";
import { toast } from "@/stores/toast-store";

type Connection = NonNullable<
  Extract<
    FunctionReturnType<typeof api.google.status>,
    { configured: true }
  >["connection"]
>;

const RESULTS: Record<string, [string, "danger"?]> = {
  connected: ["Google connected"],
  denied: ["Google wasn't connected", "danger"],
  scope: ["Allow both Gmail and Calendar access to connect Google", "danger"],
  failed: ["Couldn't connect Google. Try again.", "danger"],
  unavailable: ["Google isn't set up on this workspace", "danger"],
};

/** Reports the outcome Google's redirect left in the URL, once. */
function useRedirectResult() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const result = RESULTS[url.searchParams.get("google") ?? ""];
    if (!result) return;
    toast(result[0], result[1] ? { tone: result[1] } : undefined);
    url.searchParams.delete("google");
    window.history.replaceState(null, "", url);
  }, []);
}

/** Profile → Connections: log your own Gmail and Calendar on customers' timelines. Hidden until Google is configured. */
export default function GoogleSection() {
  const state = useQuery(api.google.status, {});
  useRedirectResult();

  if (!state) return <SettingsSkeleton rows={1} />;
  if (!state.configured) return null;

  return (
    <SettingsSection
      title="Connections"
      description="Add your emails and meetings with people in the CRM to their timeline. Read-only: the CRM never sends or changes anything in Google."
    >
      {state.connection ? (
        <Connected connection={state.connection} />
      ) : (
        <Connect />
      )}
    </SettingsSection>
  );
}

function useConnect() {
  const start = useMutation(api.google.start);
  const [busy, setBusy] = useState(false);
  async function connect() {
    setBusy(true);
    try {
      window.location.assign(await start({}));
    } catch (error) {
      toast(readError(error, "Couldn't start the connection").message, {
        tone: "danger",
      });
      setBusy(false);
    }
  }
  return { busy, connect };
}

function Connect() {
  const { busy, connect } = useConnect();
  return (
    <SettingsRow
      label="Google"
      description="Gmail and Calendar. The last 14 days of email and 30 days of meetings are added first."
    >
      <Button
        variant="secondary"
        size="sm"
        loading={busy}
        onClick={() => void connect()}
      >
        Connect Google
      </Button>
    </SettingsRow>
  );
}

function Connected({ connection }: { connection: Connection }) {
  const save = useMutation(api.google.saveSettings);
  const { busy, connect } = useConnect();
  const [editing, setEditing] = useState<"exclude" | "disconnect" | null>(null);
  const reconnect = connection.status === "reconnect";

  async function toggle(change: { mail?: boolean; calendar?: boolean }) {
    try {
      await save({
        mail: connection.mail,
        calendar: connection.calendar,
        excludes: connection.excludes.join("\n"),
        ...change,
      });
    } catch (error) {
      toast(readError(error, "Couldn't save").message, { tone: "danger" });
    }
  }

  return (
    <>
      <SettingsRow
        label={connection.email}
        description={
          reconnect ? (
            <span className="text-danger">
              Access was lost. Reconnect to keep logging.
            </span>
          ) : connection.lastError ? (
            <span className="text-danger">
              Last sync failed: {connection.lastError}
            </span>
          ) : connection.syncedAt ? (
            `Synced ${relativeTime(connection.syncedAt)}`
          ) : (
            "Syncs within 15 minutes"
          )
        }
      >
        {reconnect && (
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            onClick={() => void connect()}
          >
            Reconnect
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setEditing("disconnect")}
        >
          Disconnect
        </Button>
      </SettingsRow>
      <SettingsRow
        label="Log emails"
        htmlFor="google-mail"
        description="Messages to and from people in the CRM. Subject and a short snippet only."
      >
        <Switch
          id="google-mail"
          checked={connection.mail}
          onCheckedChange={(mail) => void toggle({ mail })}
        />
      </SettingsRow>
      <SettingsRow
        label="Log meetings"
        htmlFor="google-calendar"
        description="Calendar events you attended with people in the CRM."
      >
        <Switch
          id="google-calendar"
          checked={connection.calendar}
          onCheckedChange={(calendar) => void toggle({ calendar })}
        />
      </SettingsRow>
      <SettingsRow
        label="Never log"
        description={
          connection.excludes.length
            ? connection.excludes.join(", ")
            : "Addresses or domains to leave out, like your bank or family."
        }
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setEditing("exclude")}
        >
          Edit
        </Button>
      </SettingsRow>
      <ExcludeDialog
        open={editing === "exclude"}
        onOpenChange={(open) => setEditing(open ? "exclude" : null)}
        connection={connection}
      />
      <DisconnectDialog
        open={editing === "disconnect"}
        onOpenChange={(open) => setEditing(open ? "disconnect" : null)}
      />
    </>
  );
}

function ExcludeDialog({
  open,
  onOpenChange,
  connection,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: Connection;
}) {
  const save = useMutation(api.google.saveSettings);
  const [text, setText] = useState(connection.excludes.join("\n"));
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await save({
        mail: connection.mail,
        calendar: connection.calendar,
        excludes: text,
      });
      onOpenChange(false);
    } catch (error) {
      toast(readError(error, "Couldn't save").message, { tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setText(connection.excludes.join("\n"));
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-120">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Never log</DialogTitle>
            <DialogDescription>
              Mail and meetings with these are skipped.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 py-5">
            <Field
              label="Addresses or domains"
              htmlFor="google-exclude"
              hint="One per line, like name@bank.com or bank.com."
            >
              <Textarea
                id="google-exclude"
                autoFocus
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </Field>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary" size="sm" loading={saving}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DisconnectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const disconnect = useMutation(api.google.disconnect);
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await disconnect({ deleteImported: remove });
      toast("Google disconnected");
      onOpenChange(false);
    } catch (error) {
      toast(readError(error, "Couldn't disconnect").message, {
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-120">
        <DialogHeader>
          <DialogTitle>Disconnect Google</DialogTitle>
          <DialogDescription>
            Syncing stops and the CRM forgets its access to your account.
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-5">
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <Checkbox
              checked={remove}
              onCheckedChange={(next) => setRemove(next === true)}
              className="mt-0.5"
            />
            Also remove the emails and meetings it added to timelines
          </label>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            onClick={() => void submit()}
          >
            Disconnect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
