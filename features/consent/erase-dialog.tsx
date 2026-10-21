"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
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
import { ERASE_CONFIRMATION } from "@/lib/domain/consent";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import AlertTriangleIcon from "@/public/assets/icons/alert-triangle.svg";

export type EraseTarget =
  | { kind: "person"; id: Id<"people">; name: string }
  | { kind: "lead"; id: Id<"leads">; name: string };

const EFFECTS = [
  "Their name becomes “Erased person”; email, phone, title, LinkedIn and tags are deleted.",
  "Notes and call or email bodies on the timeline are redacted, and their name is removed from titles.",
  "Leads tied to them are anonymised the same way, and enrichment facts are deleted.",
  "Consent records stay as proof that consent existed and that erasure happened, without personal details.",
];

/**
 * Irreversible erasure behind a typed confirmation. The one place without an
 * Undo toast: keeping anything that could restore the data would defeat it.
 */
export default function EraseDialog({
  target,
  onOpenChange,
  onErased,
}: {
  target: EraseTarget | null;
  onOpenChange: (open: boolean) => void;
  onErased?: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-120">
        {target && (
          <EraseForm
            key={target.id}
            target={target}
            onDone={() => {
              onOpenChange(false);
              onErased?.();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EraseForm({
  target,
  onDone,
}: {
  target: EraseTarget;
  onDone: () => void;
}) {
  const erasePerson = useMutation(api.consents.erase);
  const eraseLead = useMutation(api.consents.eraseLead);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const ready = value.trim().toLowerCase() === ERASE_CONFIRMATION;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) {
      setError(`Type “${ERASE_CONFIRMATION}” to confirm`);
      return;
    }
    setSaving(true);
    try {
      if (target.kind === "person") {
        await erasePerson({ personId: target.id, confirmation: value });
      } else {
        await eraseLead({ leadId: target.id, confirmation: value });
      }
      toast(`${target.name}'s personal data was erased`);
      onDone();
    } catch (reason) {
      setError(readError(reason, "Couldn't erase this record").message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Erase {target.name}&apos;s personal data?</DialogTitle>
        <DialogDescription>
          Use this when they ask to be forgotten or their data is past
          retention. It happens immediately for everyone.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-5 px-6 py-5">
        <ul className="text-fg-secondary flex list-disc flex-col gap-1.5 pl-5 text-sm leading-snug">
          {EFFECTS.map((effect) => (
            <li key={effect}>{effect}</li>
          ))}
        </ul>
        <div className="border-danger/30 bg-danger/8 text-danger flex items-start gap-2.5 rounded-lg border px-3 py-2.5">
          <AlertTriangleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p className="text-sm leading-snug font-medium">
            This can&apos;t be undone. Nothing is kept that could restore the
            data.
          </p>
        </div>
        <Field
          label={`Type “${ERASE_CONFIRMATION}” to confirm`}
          htmlFor="erase-confirm"
          error={error}
        >
          <Input
            id="erase-confirm"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError(undefined);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "erase-confirm-error" : undefined}
            className="aria-invalid:border-danger"
          />
        </Field>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="subtle" size="sm">
            Cancel
          </Button>
        </DialogClose>
        <Button
          type="submit"
          size="sm"
          disabled={!ready}
          loading={saving}
          className="bg-danger text-background hover:bg-danger/90 shadow-none"
        >
          Erase permanently
        </Button>
      </DialogFooter>
    </form>
  );
}
