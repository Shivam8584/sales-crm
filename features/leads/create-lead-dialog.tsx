"use client";

import { useState, type ComponentProps, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
import { Textarea } from "@/components/_ui/textarea";
import MemberPicker from "@/features/members/member-picker";
import { useViewer } from "@/hooks/use-viewer";
import { checkGstin, gstinError } from "@/lib/domain/gstin";
import {
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
} from "@/lib/domain/normalize";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import { useUiStore } from "@/stores/ui-store";
import { routes } from "@/lib/routes";

type FieldName =
  | "name"
  | "companyName"
  | "email"
  | "phone"
  | "website"
  | "gstin"
  | "message";
type Errors = Partial<Record<FieldName | "form", string>>;
const FIELDS: FieldName[] = [
  "name",
  "companyName",
  "email",
  "phone",
  "website",
  "gstin",
  "message",
];

const EMPTY: Record<FieldName, string> = {
  name: "",
  companyName: "",
  email: "",
  phone: "",
  website: "",
  gstin: "",
  message: "",
};

const INVALID = "aria-invalid:border-danger";

/** Manual lead entry, driven by `useUiStore` create state. */
export default function CreateLeadDialog() {
  const open = useUiStore((state) => state.create?.type === "lead");
  const setCreate = useUiStore((state) => state.setCreate);
  const viewer = useViewer();
  const router = useRouter();
  const create = useMutation(api.leads.create);
  const [values, setValues] = useState(EMPTY);
  const [ownerId, setOwnerId] = useState<string>(viewer._id);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  function set(field: FieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field])
      setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function reset() {
    setValues(EMPTY);
    setOwnerId(viewer._id);
    setErrors({});
  }

  function validate() {
    const next: Errors = {};
    if (!values.name.trim()) next.name = "Enter the lead's name";
    if (!values.companyName.trim()) {
      next.companyName = "Enter the account name";
    }
    if (values.email.trim() && !normalizeEmail(values.email)) {
      next.email = "Enter a valid email address";
    }
    if (values.phone.trim() && !normalizePhone(values.phone)) {
      next.phone = "Enter a mobile number like 98200 12345";
    }
    if (!values.email.trim() && !values.phone.trim()) {
      next.email = "Add an email or a phone number";
    }
    if (values.website.trim() && !normalizeDomain(values.website)) {
      next.website = "Enter a website like brand.in";
    }
    if (values.gstin.trim()) {
      const error = gstinError(checkGstin(values.gstin));
      if (error) next.gstin = error;
    }
    return next;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    const first = FIELDS.find((field) => next[field]);
    if (first) {
      document.getElementById(`lead-${first}`)?.focus();
      return;
    }
    setSaving(true);
    try {
      const id = await create({
        name: values.name,
        companyName: values.companyName,
        email: values.email.trim() || undefined,
        phone: values.phone.trim() || undefined,
        website: values.website.trim() || undefined,
        gstin: values.gstin.trim() || undefined,
        message: values.message.trim() || undefined,
        ownerId: ownerId as Id<"members">,
      });
      setCreate(null);
      toast(`${values.name.trim()} added to leads`);
      router.push(routes.lead(id));
    } catch (error) {
      const { message, field } = readError(error, "Couldn't add the lead");
      setErrors({
        [field && FIELDS.includes(field as FieldName) ? field : "form"]:
          message,
      });
    } finally {
      setSaving(false);
    }
  }

  function input(
    field: FieldName,
    props: Partial<ComponentProps<typeof Input>> = {},
  ) {
    return (
      <Input
        id={`lead-${field}`}
        value={values[field]}
        onChange={(event) => set(field, event.target.value)}
        aria-invalid={errors[field] ? true : undefined}
        aria-describedby={errors[field] ? `lead-${field}-error` : undefined}
        className={INVALID}
        autoComplete="off"
        {...props}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && setCreate(null)}>
      <DialogContent className="max-w-120" onCloseAutoFocus={reset}>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>New lead</DialogTitle>
            <DialogDescription>
              Someone who reached out by phone, at an event or through a
              referral.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 px-6 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Name"
                htmlFor="lead-name"
                required
                error={errors.name}
              >
                {input("name", {
                  autoFocus: true,
                  placeholder: "Priya Sharma",
                })}
              </Field>
              <Field
                label="Account"
                htmlFor="lead-companyName"
                required
                error={errors.companyName}
              >
                {input("companyName")}
              </Field>
              <Field label="Email" htmlFor="lead-email" error={errors.email}>
                {input("email", {
                  type: "email",
                  inputMode: "email",
                  spellCheck: false,
                  placeholder: "name@brand.in",
                })}
              </Field>
              <Field label="Phone" htmlFor="lead-phone" error={errors.phone}>
                {input("phone", {
                  type: "tel",
                  inputMode: "tel",
                  placeholder: "98200 12345",
                  className: `${INVALID} tabular-nums`,
                })}
              </Field>
              <Field
                label="Website"
                htmlFor="lead-website"
                error={errors.website}
              >
                {input("website", {
                  inputMode: "url",
                  spellCheck: false,
                  placeholder: "brand.in",
                })}
              </Field>
              <Field label="GSTIN" htmlFor="lead-gstin" error={errors.gstin}>
                {input("gstin", {
                  maxLength: 15,
                  spellCheck: false,
                  placeholder: "29AAACI4798L1ZU",
                  className: `${INVALID} font-mono uppercase`,
                })}
              </Field>
            </div>
            <Field label="Notes" htmlFor="lead-message" error={errors.message}>
              <Textarea
                id="lead-message"
                rows={3}
                value={values.message}
                onChange={(event) => set("message", event.target.value)}
                placeholder="What they asked about, where you met"
              />
            </Field>
            <div className="flex flex-col gap-2">
              <span className="caption-style text-fg-secondary">Owner</span>
              <MemberPicker
                value={ownerId}
                onChange={setOwnerId}
                className="border-input bg-secondary mx-0 h-9 border px-3"
              />
              <span className="caption-style text-fg-tertiary leading-snug">
                {ownerId === viewer._id
                  ? "You own it, so it starts as contacted with no SLA clock."
                  : "They get a notification and the speed-to-lead clock starts."}
              </span>
            </div>
            {errors.form && (
              <p role="alert" className="caption-style text-danger">
                {errors.form}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="subtle" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary" size="sm" loading={saving}>
              Add lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
