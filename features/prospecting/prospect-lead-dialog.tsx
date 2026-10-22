"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
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
import { Textarea } from "@/components/_ui/textarea";
import { normalizeEmail, normalizePhone } from "@/lib/domain/normalize";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";

export type LeadDraft = {
  key: string;
  brand: string;
  talkingPoint: string | null;
};

type FieldName = "name" | "email" | "phone" | "message";
type Errors = Partial<Record<FieldName | "form", string>>;

/** A lead for a prospect brand, prefilled with its review-gap talking point. */
export default function ProspectLeadDialog({
  draft,
  onClose,
  onCreated,
}: {
  draft: LeadDraft | null;
  onClose: () => void;
  onCreated?: (leadId: string) => void;
}) {
  return (
    <Dialog open={draft !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-120">
        {draft && (
          <LeadForm draft={draft} onClose={onClose} onCreated={onCreated} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LeadForm({
  draft,
  onClose,
  onCreated,
}: {
  draft: LeadDraft;
  onClose: () => void;
  onCreated?: (leadId: string) => void;
}) {
  const create = useMutation(api.prospecting.createProspectLead);
  const [values, setValues] = useState<Record<FieldName, string>>({
    name: "",
    email: "",
    phone: "",
    message: draft.talkingPoint ?? "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  function set(field: FieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field])
      setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: Errors = {};
    if (values.email.trim() && !normalizeEmail(values.email)) {
      next.email = "Enter a valid email address";
    }
    if (values.phone.trim() && !normalizePhone(values.phone)) {
      next.phone = "Enter a mobile number like 98200 12345";
    }
    if (!values.message.trim()) next.message = "Add the talking point";
    setErrors(next);
    const first = (["email", "phone", "message"] as const).find(
      (field) => next[field],
    );
    if (first) {
      document.getElementById(`prospect-${first}`)?.focus();
      return;
    }
    setSaving(true);
    try {
      const { id } = await create({
        key: draft.key,
        name: values.name.trim() || undefined,
        email: values.email.trim() || undefined,
        phone: values.phone.trim() || undefined,
        message: values.message,
      });
      toast(`Lead created for ${draft.brand}`);
      onCreated?.(id);
      onClose();
    } catch (error) {
      const { message, field } = readError(error, "Couldn't create the lead");
      setErrors({
        [field && ["name", "email", "phone", "message"].includes(field)
          ? field
          : "form"]: message,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Lead for {draft.brand}</DialogTitle>
        <DialogDescription>
          You own it. The talking point is saved as the lead&apos;s note.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4 px-6 py-5">
        <Field label="Contact name" htmlFor="prospect-name" error={errors.name}>
          <Input
            id="prospect-name"
            value={values.name}
            onChange={(event) => set("name", event.target.value)}
            placeholder={`${draft.brand} team`}
            autoComplete="off"
          />
        </Field>
        <div className="flex flex-col gap-4">
          <Field label="Email" htmlFor="prospect-email" error={errors.email}>
            <Input
              id="prospect-email"
              type="email"
              inputMode="email"
              spellCheck={false}
              value={values.email}
              onChange={(event) => set("email", event.target.value)}
              placeholder="founder@brand.in"
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={
                errors.email ? "prospect-email-error" : undefined
              }
              autoComplete="off"
            />
          </Field>
          <Field label="Phone" htmlFor="prospect-phone" error={errors.phone}>
            <Input
              id="prospect-phone"
              type="tel"
              inputMode="tel"
              value={values.phone}
              onChange={(event) => set("phone", event.target.value)}
              placeholder="98200 12345"
              aria-invalid={errors.phone ? true : undefined}
              aria-describedby={
                errors.phone ? "prospect-phone-error" : undefined
              }
              className="tabular-nums"
              autoComplete="off"
            />
          </Field>
        </div>
        <Field
          label="Talking point"
          htmlFor="prospect-message"
          required
          error={errors.message}
        >
          <Textarea
            id="prospect-message"
            rows={3}
            value={values.message}
            onChange={(event) => set("message", event.target.value)}
            aria-invalid={errors.message ? true : undefined}
            aria-describedby={
              errors.message ? "prospect-message-error" : undefined
            }
          />
        </Field>
        {errors.form && (
          <p role="alert" className="caption-style text-danger">
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
          Create lead
        </Button>
      </DialogFooter>
    </form>
  );
}
