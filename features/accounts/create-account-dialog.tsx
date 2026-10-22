"use client";

import { useRef, useState, type FormEvent } from "react";
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
import OptionPicker from "@/components/fields/option-picker";
import MemberPicker from "@/features/members/member-picker";
import { useViewer } from "@/hooks/use-viewer";
import type { LifecycleStage } from "@/lib/domain/enums";
import { LOGO_ACCEPT } from "@/lib/domain/logo";
import { normalizeDomain } from "@/lib/domain/normalize";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import AccountLogo from "./account-logo";
import { STAGE_OPTIONS } from "./stage";
import { useLogoPick, useLogoUpload } from "./use-logo";

type Errors = Partial<Record<"name" | "domain" | "form", string>>;

export default function CreateAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const viewer = useViewer();
  const create = useMutation(api.accounts.create);
  const uploadLogo = useLogoUpload();
  const logo = useLogoPick();
  const logoInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [stage, setStage] = useState<LifecycleStage>("prospect");
  const [ownerId, setOwnerId] = useState<string>(viewer._id);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const preview = normalizeDomain(domain);

  function reset() {
    setName("");
    setDomain("");
    setStage("prospect");
    setOwnerId(viewer._id);
    setErrors({});
    logo.clear();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: Errors = {};
    if (!name.trim()) next.name = "Enter the account name";
    if (domain.trim() && !preview) next.domain = "Enter a website like acme.in";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      const id = await create({
        name,
        domain: domain.trim() || undefined,
        stage,
        ownerId: ownerId as Id<"members">,
      });
      onOpenChange(false);
      toast(`${name.trim()} added`);
      if (logo.picked) {
        try {
          const message = await uploadLogo(id, logo.picked.file);
          if (message) toast(message, { tone: "danger" });
        } catch (error) {
          toast(readError(error, "Couldn't upload the logo").message, {
            tone: "danger",
          });
        }
      }
      router.push(`/accounts/${id}`);
    } catch (error) {
      const { message, field } = readError(
        error,
        "Couldn't create the account",
      );
      setErrors({
        [field === "name" || field === "domain" ? field : "form"]: message,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-110" onCloseAutoFocus={reset}>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>New account</DialogTitle>
            <DialogDescription>
              A brand or seller you want to work with.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 px-6 py-5">
            <div className="flex items-end gap-3">
              <AccountLogo
                account={{
                  name: name || "?",
                  domain: preview,
                  logoUrl: logo.picked?.url,
                }}
                size="lg"
              />
              <Field
                label="Name"
                htmlFor="account-name"
                required
                error={errors.name}
                className="flex-1"
              >
                <Input
                  id="account-name"
                  autoFocus
                  autoComplete="off"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Kesar Leaf Naturals"
                  aria-invalid={errors.name ? true : undefined}
                  className="aria-invalid:border-danger"
                />
              </Field>
            </div>
            <Field
              label="Website"
              htmlFor="account-domain"
              hint={
                errors.domain
                  ? undefined
                  : "Used for the logo and to spot duplicates."
              }
              error={errors.domain}
            >
              <Input
                id="account-domain"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                placeholder="kesarleaf.in"
                aria-invalid={errors.domain ? true : undefined}
                className="aria-invalid:border-danger"
              />
            </Field>
            <Field
              label="Logo"
              htmlFor="account-logo"
              hint="Optional. PNG, JPEG or WebP, up to 1 MB."
            >
              <div className="flex items-center gap-2">
                <input
                  ref={logoInput}
                  aria-hidden
                  tabIndex={-1}
                  type="file"
                  hidden
                  accept={LOGO_ACCEPT}
                  onChange={(event) => {
                    logo.pick(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                <Button
                  id="account-logo"
                  variant="secondary"
                  size="sm"
                  onClick={() => logoInput.current?.click()}
                >
                  {logo.picked ? "Choose another" : "Choose image"}
                </Button>
                {logo.picked && (
                  <>
                    <span
                      title={logo.picked.file.name}
                      className="caption-style text-fg-secondary min-w-0 truncate"
                    >
                      {logo.picked.file.name}
                    </span>
                    <Button variant="ghost" size="xs" onClick={logo.clear}>
                      Remove
                    </Button>
                  </>
                )}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <span className="caption-style text-fg-secondary">Stage</span>
                <OptionPicker
                  value={stage}
                  label="Stage"
                  options={STAGE_OPTIONS}
                  onChange={(value) =>
                    value && setStage(value as LifecycleStage)
                  }
                  className="border-input bg-secondary mx-0 h-9 border px-3"
                />
              </div>
              <div className="flex flex-col gap-2">
                <span className="caption-style text-fg-secondary">Owner</span>
                <MemberPicker
                  value={ownerId}
                  onChange={setOwnerId}
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
              Create account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
