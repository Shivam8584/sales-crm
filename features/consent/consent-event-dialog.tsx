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
import { Textarea } from "@/components/_ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/_ui/select";
import Pills from "@/features/tasks/pills";
import { chipClass } from "@/features/tasks/task-chips";
import {
  CONSENT_CHANNEL_LABEL,
  CONSENT_PURPOSES,
  CONSENT_PURPOSE_LABEL,
  CONSENT_SOURCES,
  CONSENT_SOURCE_LABEL,
  LAWFUL_BASES,
  LAWFUL_BASIS_HINT,
  LAWFUL_BASIS_LABEL,
  MAX_EVIDENCE,
  type ConsentPurpose,
  type ConsentSource,
  type LawfulBasis,
} from "@/lib/domain/consent";
import { CHANNELS, type Channel } from "@/lib/domain/enums";
import { readError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";

export type ConsentAction =
  | "grant"
  | "withdraw"
  | "dnd_on"
  | "dnd_off"
  | "erasure_requested"
  | "erasure_dismissed";

type Copy = {
  title: string;
  description: (name: string) => string;
  submit: string;
  done: (name: string) => string;
  placeholder: string;
};

const COPY: Record<ConsentAction, Copy> = {
  grant: {
    title: "Record consent",
    description: (name) =>
      `Log what ${name} agreed to and how you know. Records are kept permanently as proof.`,
    submit: "Record consent",
    done: (name) => `Consent recorded for ${name}`,
    placeholder:
      "e.g. Said yes on the 14 Oct demo call to emails about pricing",
  },
  withdraw: {
    title: "Withdraw consent",
    description: (name) =>
      `Stops outreach to ${name} on the channels you pick. Withdrawing must be as easy as agreeing, so record it as soon as they ask.`,
    submit: "Withdraw",
    done: (name) => `Consent withdrawn for ${name}`,
    placeholder: "e.g. Replied “please stop emailing me” on 14 Oct",
  },
  dnd_on: {
    title: "Mark number as DND",
    description: () =>
      "Blocks promotional calls and SMS to this number. Use it when they ask not to be called or the number is on the NCPR (DND) registry.",
    submit: "Mark DND",
    done: (name) => `${name}'s number marked DND`,
    placeholder: "e.g. Number is on the NCPR list, checked 14 Oct",
  },
  dnd_off: {
    title: "Clear DND",
    description: () =>
      "Only clear DND when they've asked to be called again or the NCPR check came back clear.",
    submit: "Clear DND",
    done: (name) => `DND cleared for ${name}`,
    placeholder: "e.g. Asked us to call back about onboarding",
  },
  erasure_requested: {
    title: "Record erasure request",
    description: (name) =>
      `Contact with ${name} stops on every channel right away. An admin then erases their data from Settings → Privacy.`,
    submit: "Record request",
    done: (name) => `Erasure request recorded for ${name}`,
    placeholder: "e.g. Emailed asking us to delete their data",
  },
  erasure_dismissed: {
    title: "Dismiss erasure request",
    description: (name) =>
      `Contact with ${name} resumes under their existing consent. Say why the request no longer applies.`,
    submit: "Dismiss request",
    done: () => "Erasure request dismissed",
    placeholder: "e.g. Recorded by mistake on the wrong person",
  },
};

type Errors = Partial<
  Record<"channels" | "purpose" | "basis" | "note" | "form", string>
>;

const PURPOSE_ALL = "all";

/** Appends one consent-ledger event for a person, with a required evidence note. */
export default function ConsentEventDialog({
  action,
  personId,
  name,
  defaultChannels,
  onOpenChange,
}: {
  action: ConsentAction | null;
  personId: Id<"people">;
  name: string;
  defaultChannels: Channel[];
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={action !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-120">
        {action && (
          <ConsentForm
            key={action}
            action={action}
            personId={personId}
            name={name}
            defaultChannels={defaultChannels}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConsentForm({
  action,
  personId,
  name,
  defaultChannels,
  onDone,
}: {
  action: ConsentAction;
  personId: Id<"people">;
  name: string;
  defaultChannels: Channel[];
  onDone: () => void;
}) {
  const record = useMutation(api.consents.record);
  const setDnd = useMutation(api.consents.setDnd);
  const requestErasure = useMutation(api.consents.requestErasure);
  const dismissErasure = useMutation(api.consents.dismissErasure);
  const copy = COPY[action];
  const consent = action === "grant" || action === "withdraw";
  const [channels, setChannels] = useState<Channel[]>(
    action === "withdraw" ? [...CHANNELS] : defaultChannels,
  );
  const [purpose, setPurpose] = useState<ConsentPurpose | typeof PURPOSE_ALL>(
    action === "withdraw" ? PURPOSE_ALL : "sales_outreach",
  );
  const [basis, setBasis] = useState<LawfulBasis>("consent");
  const [source, setSource] = useState<ConsentSource>("call");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const whatsappConflict =
    action === "grant" && channels.includes("whatsapp") && basis !== "consent";

  function toggleChannel(channel: Channel) {
    setErrors((current) => ({
      ...current,
      channels: undefined,
      basis: undefined,
    }));
    setChannels((current) =>
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : CHANNELS.filter((item) => item === channel || current.includes(item)),
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: Errors = {};
    if (consent && channels.length === 0)
      next.channels = "Pick at least one channel";
    if (whatsappConflict) {
      next.basis = "WhatsApp needs their opt-in, so the basis must be consent";
    }
    if (!note.trim()) next.note = "Add a note on how you know this";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      if (action === "grant" || action === "withdraw") {
        await record({
          personId,
          channels,
          event: action,
          purpose: purpose === PURPOSE_ALL ? undefined : purpose,
          basis: action === "grant" ? basis : undefined,
          source,
          note,
        });
      } else if (action === "dnd_on" || action === "dnd_off") {
        await setDnd({ personId, on: action === "dnd_on", source, note });
      } else if (action === "erasure_requested") {
        await requestErasure({ personId, source, note });
      } else {
        await dismissErasure({ personId, note });
      }
      toast(copy.done(name));
      onDone();
    } catch (error) {
      const { message, field } = readError(error, "Couldn't save this");
      const key = (
        ["channels", "purpose", "basis", "note"] as string[]
      ).includes(field ?? "")
        ? (field as keyof Errors)
        : "form";
      setErrors({ [key]: message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription>{copy.description(name)}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-5 px-6 py-5">
        {consent && (
          <fieldset className="flex flex-col gap-2">
            <legend className="caption-style text-fg-secondary mb-2">
              Channels
            </legend>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map((channel) => {
                const on = channels.includes(channel);
                return (
                  <button
                    key={channel}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleChannel(channel)}
                    className={cn(
                      chipClass("md"),
                      "text-fg-tertiary aria-pressed:text-foreground aria-pressed:shadow-[0_0_0_1px_var(--foreground)]",
                    )}
                  >
                    {CONSENT_CHANNEL_LABEL[channel]}
                  </button>
                );
              })}
            </div>
            {errors.channels && (
              <span role="alert" className="caption-style text-danger">
                {errors.channels}
              </span>
            )}
          </fieldset>
        )}
        {consent && (
          <div className="flex flex-col gap-2">
            <span className="caption-style text-fg-secondary">
              {action === "grant" ? "For" : "Withdraw from"}
            </span>
            <Pills
              label={action === "grant" ? "Purpose" : "Withdraw from"}
              value={purpose}
              onChange={setPurpose}
              options={[
                ...(action === "withdraw"
                  ? [
                      {
                        value: PURPOSE_ALL as typeof PURPOSE_ALL,
                        label: "Everything",
                      },
                    ]
                  : []),
                ...CONSENT_PURPOSES.map((value) => ({
                  value,
                  label: CONSENT_PURPOSE_LABEL[value],
                })),
              ]}
            />
          </div>
        )}
        {action === "grant" && (
          <div className="flex flex-col gap-2">
            <span className="caption-style text-fg-secondary">
              Lawful basis
            </span>
            <Pills
              label="Lawful basis"
              value={basis}
              onChange={(value) => {
                setBasis(value);
                setErrors((current) => ({ ...current, basis: undefined }));
              }}
              options={LAWFUL_BASES.map((value) => ({
                value,
                label: LAWFUL_BASIS_LABEL[value],
              }))}
            />
            <span
              role={errors.basis || whatsappConflict ? "alert" : undefined}
              className={cn(
                "caption-style leading-snug",
                errors.basis || whatsappConflict
                  ? "text-danger"
                  : "text-fg-tertiary",
              )}
            >
              {errors.basis ??
                (whatsappConflict
                  ? "WhatsApp needs their opt-in, so pick Consent or untick WhatsApp."
                  : LAWFUL_BASIS_HINT[basis])}
            </span>
          </div>
        )}
        {action !== "erasure_dismissed" && (
          <Field label="How you heard it" htmlFor="consent-source">
            <Select
              value={source}
              onValueChange={(value) => setSource(value as ConsentSource)}
            >
              <SelectTrigger id="consent-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONSENT_SOURCES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {CONSENT_SOURCE_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field
          label="Evidence"
          htmlFor="consent-note"
          required
          error={errors.note}
          hint="Kept with the record. What was said, when, and where it's written down."
        >
          <Textarea
            id="consent-note"
            rows={3}
            autoFocus
            maxLength={MAX_EVIDENCE}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              setErrors((current) => ({ ...current, note: undefined }));
            }}
            placeholder={copy.placeholder}
            aria-invalid={errors.note ? true : undefined}
            aria-describedby={
              errors.note ? "consent-note-error" : "consent-note-hint"
            }
          />
        </Field>
        {errors.form && (
          <p role="alert" className="caption-style text-danger leading-snug">
            {errors.form}
          </p>
        )}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="secondary" size="sm">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" variant="primary" size="sm" loading={saving}>
          {copy.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}
