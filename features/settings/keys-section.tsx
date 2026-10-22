"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import {
  Collapsible,
  CollapsibleChevron,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/_ui/collapsible";
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
import { Input } from "@/components/_ui/input";
import { readError } from "@/lib/errors";
import { relativeTime } from "@/lib/time";
import { toast } from "@/stores/toast-store";
import {
  Code,
  SettingsRow,
  SettingsSection,
  SettingsSkeleton,
} from "./settings-ui";

type Status = FunctionReturnType<typeof api.secrets.status>;
type Key = Status["groups"][number]["keys"][number];

const ACTION = { set: "added", rotate: "replaced", remove: "removed" } as const;

function describe(key: Key) {
  if (!key.source) return "Not set";
  const value = key.secret ? `ending ${key.hint}` : key.hint;
  if (key.source === "env") return `Set in the environment, ${value}`;
  return [
    `Stored, ${value}`,
    key.updatedAt && `${key.updatedBy}, ${relativeTime(key.updatedAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Integration keys kept encrypted in the database; an environment variable of the same name wins. */
export default function KeysSection() {
  const status = useQuery(api.secrets.status, {});
  const [editing, setEditing] = useState<Key | null>(null);
  if (!status) return <SettingsSkeleton rows={4} />;

  return (
    <SettingsSection
      title="Keys"
      description="Kept encrypted and never shown again. An environment variable with the same name takes precedence."
    >
      {!status.encryption && (
        <p className="caption-style border-border text-fg-tertiary border-t py-3.5 leading-relaxed">
          Keys can only be set through environment variables until{" "}
          <Code>KEYS_ENCRYPTION_KEY</Code> (32 or more random characters) is set
          on the Convex deployment.
        </p>
      )}
      {status.groups.map((group) => (
        <div key={group.id} className="flex flex-col pb-4">
          <h3 className="caption-style text-fg-tertiary border-border border-t pt-3.5">
            {group.label}. {group.description}
          </h3>
          {group.keys.map((key) => (
            <KeyRow
              key={key.name}
              item={key}
              canWrite={status.encryption}
              onEdit={() => setEditing(key)}
            />
          ))}
        </div>
      ))}
      <History events={status.history} />
      <KeyDialog item={editing} onClose={() => setEditing(null)} />
    </SettingsSection>
  );
}

function KeyRow({
  item,
  canWrite,
  onEdit,
}: {
  item: Key;
  canWrite: boolean;
  onEdit: () => void;
}) {
  const remove = useMutation(api.secrets.remove);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await remove({ name: item.name });
      toast(`Removed ${item.label.toLowerCase()}`);
    } catch (error) {
      toast(readError(error, "Couldn't remove the key").message, {
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsRow
      label={item.label}
      description={
        <>
          <Code>{item.name}</Code> · {describe(item)}
        </>
      }
    >
      {item.stored && (
        <Button
          variant="ghost"
          size="xs"
          loading={busy}
          onClick={() => void submit()}
          aria-label={`Remove ${item.label}`}
        >
          Remove
        </Button>
      )}
      {canWrite && item.source !== "env" && (
        <Button
          variant="secondary"
          size="xs"
          onClick={onEdit}
          aria-label={`${item.stored ? "Rotate" : "Set"} ${item.label}`}
        >
          {item.stored ? "Rotate" : "Set"}
        </Button>
      )}
    </SettingsRow>
  );
}

function KeyDialog({
  item,
  onClose,
}: {
  item: Key | null;
  onClose: () => void;
}) {
  const save = useMutation(api.secrets.set);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!item) return;
    setSaving(true);
    setError(undefined);
    try {
      await save({ name: item.name, value });
      toast(`Saved ${item.label.toLowerCase()}`);
      onClose();
    } catch (reason) {
      setError(readError(reason, "Couldn't save the key").message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-120"
        onCloseAutoFocus={() => {
          setValue("");
          setError(undefined);
        }}
      >
        {item && (
          <form onSubmit={submit} noValidate>
            <DialogHeader>
              <DialogTitle>
                {item.stored ? "Rotate" : "Set"} {item.label.toLowerCase()}
              </DialogTitle>
              <DialogDescription>
                {item.secret
                  ? "It is stored encrypted and can't be read back."
                  : "It is stored encrypted."}
              </DialogDescription>
            </DialogHeader>
            <div className="px-6 py-5">
              <Field label={item.label} htmlFor="key-value" error={error}>
                <Input
                  id="key-value"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  type={item.secret ? "password" : "text"}
                  value={value}
                  onChange={(event) => {
                    setValue(event.target.value);
                    setError(undefined);
                  }}
                  placeholder={item.example}
                  aria-invalid={error ? true : undefined}
                  className="aria-invalid:border-danger"
                />
              </Field>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={saving}
              >
                Save
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function History({ events }: { events: Status["history"] }) {
  if (events.length === 0) return null;
  return (
    <Collapsible className="group/collapsible flex flex-col">
      <CollapsibleTrigger className="caption-style text-fg-secondary hover:text-foreground focus-visible:ring-ring duration-fast relative -mx-1 flex w-fit cursor-pointer items-center gap-1.5 rounded-sm px-1 py-1 transition-colors outline-none focus-visible:ring-2 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-3 pointer-coarse:after:content-['']">
        Recent changes
        <CollapsibleChevron />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="caption-style text-fg-tertiary flex flex-col gap-1.5 pt-2">
          {events.map((event) => (
            <li key={event._id}>
              {event.by} {ACTION[event.action]} <Code>{event.name}</Code> ·{" "}
              {relativeTime(event.at)}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
