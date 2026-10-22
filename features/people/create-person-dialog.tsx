"use client";

import { useState, type FormEvent } from "react";
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
import AccountPicker from "@/features/accounts/account-picker";
import { normalizeEmail, normalizePhone } from "@/lib/domain/normalize";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";

type FieldName = "firstName" | "email" | "phone";
type Errors = Partial<Record<FieldName | "form", string>>;

export default function CreatePersonDialog({
  open,
  accountId,
  onOpenChange,
}: {
  open: boolean;
  accountId?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const create = useMutation(api.people.create);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [account, setAccount] = useState<string | null>(accountId ?? null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [seenAccountId, setSeenAccountId] = useState(accountId);

  if (seenAccountId !== accountId) {
    setSeenAccountId(accountId);
    setAccount(accountId ?? null);
  }

  function reset() {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setTitle("");
    setErrors({});
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: Errors = {};
    if (!firstName.trim()) next.firstName = "Enter a first name";
    if (email.trim() && !normalizeEmail(email))
      next.email = "Enter a valid email address";
    if (phone.trim() && !normalizePhone(phone)) {
      next.phone = "Enter a mobile number, or include the country code";
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      const id = await create({
        firstName,
        lastName: lastName || undefined,
        email: email || undefined,
        phone: phone || undefined,
        title: title || undefined,
        accountId: (account as Id<"accounts"> | null) ?? undefined,
      });
      onOpenChange(false);
      toast(`${firstName.trim()} added`, undefined);
      if (!accountId) router.push(`/records/people/${id}`);
    } catch (error) {
      const { message, field } = readError(error, "Couldn't add this person");
      const key = (["firstName", "email", "phone"] as string[]).includes(
        field ?? "",
      )
        ? (field as FieldName)
        : "form";
      setErrors({ [key]: message });
    } finally {
      setSaving(false);
    }
  }

  const input = (field: FieldName) => ({
    "aria-invalid": errors[field] ? true : undefined,
    className: "aria-invalid:border-danger",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-120" onCloseAutoFocus={reset}>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>New person</DialogTitle>
            <DialogDescription>
              Someone you talk to at a brand.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 px-6 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="First name"
                htmlFor="person-first"
                required
                error={errors.firstName}
              >
                <Input
                  id="person-first"
                  autoFocus
                  autoComplete="off"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="Priya"
                  {...input("firstName")}
                />
              </Field>
              <Field label="Last name" htmlFor="person-last">
                <Input
                  id="person-last"
                  autoComplete="off"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Iyer"
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" htmlFor="person-email" error={errors.email}>
                <Input
                  id="person-email"
                  type="email"
                  autoComplete="off"
                  spellCheck={false}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="priya@kesarleaf.in"
                  {...input("email")}
                />
              </Field>
              <Field label="Phone" htmlFor="person-phone" error={errors.phone}>
                <Input
                  id="person-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="98200 12345"
                  {...input("phone")}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title" htmlFor="person-title">
                <Input
                  id="person-title"
                  autoComplete="off"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Founder"
                />
              </Field>
              <div className="flex flex-col gap-2">
                <span className="caption-style text-fg-secondary">Account</span>
                <AccountPicker
                  value={account}
                  onChange={setAccount}
                  className="border-input bg-secondary mx-0 h-9 border px-3"
                />
              </div>
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
              Add person
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
