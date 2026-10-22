"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
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
import {
  Collapsible,
  CollapsibleChevron,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/_ui/collapsible";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import OptionPicker from "@/components/fields/option-picker";
import AccountPicker from "@/features/accounts/account-picker";
import MemberPicker from "@/features/members/member-picker";
import { useViewer } from "@/hooks/use-viewer";
import { DEAL_STAGES, type DealStage } from "@/lib/domain/enums";
import { DEFAULT_CURRENCY, type Money } from "@/lib/domain/money";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import { useUiStore, type CreateDialog } from "@/stores/ui-store";
import { LostReasonChips } from "./lost-reason-dialog";
import MoneyInput from "./money-input";
import PeoplePicker from "./people-picker";
import { DEAL_STAGE_OPTIONS } from "./stage";

const MAX_TITLE = 120;

type Form = {
  title: string;
  accountId: string | null;
  stage: DealStage;
  amount: Money;
  ownerId: string;
  closeDate: string;
  personIds: string[];
  lostReason: string;
};

type FieldKey = "title" | "accountId" | "amount" | "closeDate" | "lostReason";
type Errors = Partial<Record<FieldKey | "form", string>>;

const PICKER_CLASS = "bg-well mx-0 h-10 w-full rounded-xl px-3";

type Preset = Extract<CreateDialog, { type: "deal" }>;

/**
 * Create dialog for deals, driven by `useUiStore().create`. Deals are edited
 * inline on their page and peek, so an edit request opens the peek instead.
 */
export default function DealDialog() {
  const create = useUiStore((state) => state.create);
  const edit = useUiStore((state) => state.edit);
  const setCreate = useUiStore((state) => state.setCreate);
  const setEdit = useUiStore((state) => state.setEdit);
  const setPeek = useUiStore((state) => state.setPeek);

  useEffect(() => {
    if (edit?.type !== "deal") return;
    setEdit(null);
    setPeek({ type: "deal", id: edit.id });
  }, [edit, setEdit, setPeek]);

  const preset = create?.type === "deal" ? create : null;
  // Keep rendering the last preset while the dialog animates out.
  const [shown, setShown] = useState<Preset | null>(preset);
  const [session, setSession] = useState(0);
  if (preset && preset !== shown) {
    setShown(preset);
    setSession((count) => count + 1);
  }

  const close = () => setCreate(null);

  return (
    <Dialog open={preset !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-130">
        {shown && <DealForm key={session} preset={shown} onDone={close} />}
      </DialogContent>
    </Dialog>
  );
}

function isStage(value: string | undefined): value is DealStage {
  return (DEAL_STAGES as readonly string[]).includes(value ?? "");
}

function validate(form: Form): Errors {
  const errors: Errors = {};
  const title = form.title.trim();
  if (!title) errors.title = "Enter a title for the deal";
  else if (title.length > MAX_TITLE) errors.title = "Keep the title shorter";
  if (!form.accountId) errors.accountId = "Pick an account";
  if (!Number.isSafeInteger(form.amount.amount) || form.amount.amount < 0) {
    errors.amount = "Enter a positive amount";
  }
  if (form.stage === "lost" && !form.lostReason.trim()) {
    errors.lostReason = "Say why the deal was lost";
  }
  return errors;
}

function DealForm({ preset, onDone }: { preset: Preset; onDone: () => void }) {
  const viewer = useViewer();
  const createDeal = useMutation(api.deals.create);
  const removeCreated = useMutation(api.deals.remove);

  const [form, setForm] = useState<Form>(() => ({
    title: "",
    accountId: preset.accountId ?? null,
    stage: isStage(preset.stage) ? preset.stage : "discovery",
    amount: { amount: 0, currency: DEFAULT_CURRENCY },
    ownerId: viewer._id,
    closeDate: "",
    personIds: [],
    lostReason: "",
  }));
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>(
    {},
  );
  const [saving, setSaving] = useState(false);
  const [more, setMore] = useState(
    isStage(preset.stage) && preset.stage !== "discovery",
  );

  const errors = validate(form);
  const valid = Object.keys(errors).length === 0;
  const shown = (key: FieldKey) =>
    serverErrors[key] ?? (touched[key] ? errors[key] : undefined);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setServerErrors((current) => ({
      ...current,
      [key]: undefined,
      form: undefined,
    }));
  }

  const touch = (key: FieldKey) =>
    setTouched((current) => ({ ...current, [key]: true }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || saving) return;
    const title = form.title.trim();
    setSaving(true);
    try {
      const id = await createDeal({
        title,
        accountId: form.accountId as Id<"accounts">,
        stage: form.stage,
        amount: form.amount,
        ownerId: form.ownerId as Id<"members">,
        closeDate: form.closeDate || undefined,
        personIds: form.personIds as Id<"people">[],
        lostReason: form.stage === "lost" ? form.lostReason.trim() : undefined,
      });
      toast(`Created ${title}`, () => {
        void removeCreated({ id }).catch((error) =>
          toast(readError(error).message, { tone: "danger" }),
        );
      });
      onDone();
    } catch (error) {
      const { message, field } = readError(error, "Couldn't save the deal");
      const key =
        field === "personIds"
          ? "form"
          : field &&
              [
                "title",
                "accountId",
                "amount",
                "closeDate",
                "lostReason",
              ].includes(field)
            ? field
            : "form";
      setServerErrors({ [key]: message });
      setSaving(false);
    }
  }

  const titleError = shown("title");
  const amountError = shown("amount");
  const closeDateError = shown("closeDate");
  const reasonError = shown("lostReason");

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>New deal</DialogTitle>
        <DialogDescription className="sr-only">
          Create a deal for an account
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4 px-6 py-5">
        <Field label="Title" htmlFor="deal-title" required error={titleError}>
          <Input
            id="deal-title"
            autoFocus
            autoComplete="off"
            maxLength={MAX_TITLE + 20}
            value={form.title}
            onChange={(event) => set("title", event.target.value)}
            onBlur={() => touch("title")}
            placeholder="Launch campaign for 3 hero SKUs"
            aria-invalid={titleError ? true : undefined}
            aria-describedby={titleError ? "deal-title-error" : undefined}
            className="aria-invalid:border-danger"
          />
        </Field>

        <PickerField label="Account" required error={shown("accountId")}>
          <AccountPicker
            value={form.accountId}
            placeholder="Pick an account"
            onChange={(accountId) => {
              if (accountId === form.accountId) return;
              setForm((current) => ({
                ...current,
                accountId,
                personIds: [],
              }));
              touch("accountId");
            }}
            className={PICKER_CLASS}
          />
        </PickerField>

        <Field
          label="Amount"
          htmlFor="deal-amount"
          hint={amountError ? undefined : "Expected monthly take"}
          error={amountError}
        >
          <MoneyInput
            id="deal-amount"
            value={form.amount}
            onChange={(amount) => set("amount", amount)}
            invalid={Boolean(amountError)}
            describedBy={amountError ? "deal-amount-error" : "deal-amount-hint"}
          />
        </Field>

        <Collapsible
          open={more || Boolean(closeDateError || reasonError)}
          onOpenChange={setMore}
          className="group/collapsible flex flex-col"
        >
          <CollapsibleTrigger className="caption-style text-fg-secondary hover:text-foreground focus-visible:ring-ring duration-fast -mx-1 flex w-fit cursor-pointer items-center gap-1.5 rounded-sm px-1 py-1 transition-colors outline-none focus-visible:ring-2">
            More options
            <CollapsibleChevron />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="flex flex-col gap-4 pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <PickerField label="Stage">
                  <OptionPicker
                    value={form.stage}
                    label="Stage"
                    options={DEAL_STAGE_OPTIONS}
                    onChange={(value) =>
                      value && set("stage", value as DealStage)
                    }
                    className={PICKER_CLASS}
                  />
                </PickerField>
                <Field
                  label="Close date"
                  htmlFor="deal-close-date"
                  error={closeDateError}
                >
                  <Input
                    id="deal-close-date"
                    type="date"
                    value={form.closeDate}
                    onChange={(event) => set("closeDate", event.target.value)}
                    aria-invalid={closeDateError ? true : undefined}
                    className="aria-invalid:border-danger tabular-nums"
                  />
                </Field>
              </div>
              {form.stage === "lost" && (
                <Field
                  label="Lost reason"
                  htmlFor="deal-lost-reason"
                  required
                  error={reasonError}
                >
                  <Input
                    id="deal-lost-reason"
                    autoComplete="off"
                    maxLength={280}
                    value={form.lostReason}
                    onChange={(event) => set("lostReason", event.target.value)}
                    onBlur={() => touch("lostReason")}
                    aria-invalid={reasonError ? true : undefined}
                    aria-describedby={
                      reasonError ? "deal-lost-reason-error" : undefined
                    }
                    className="aria-invalid:border-danger"
                  />
                  <LostReasonChips
                    value={form.lostReason}
                    onPick={(reason) => set("lostReason", reason)}
                  />
                </Field>
              )}
              <PickerField label="Owner">
                <MemberPicker
                  value={form.ownerId}
                  onChange={(ownerId) => set("ownerId", ownerId)}
                  className={PICKER_CLASS}
                />
              </PickerField>
              <Field label="Contacts" htmlFor="deal-contacts">
                <PeoplePicker
                  id="deal-contacts"
                  accountId={form.accountId}
                  value={form.personIds}
                  onChange={(ids) => set("personIds", ids)}
                />
              </Field>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {serverErrors.form && (
          <p role="alert" className="caption-style text-danger">
            {serverErrors.form}
          </p>
        )}
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
          disabled={!valid}
        >
          Create deal
        </Button>
      </DialogFooter>
    </form>
  );
}

function PickerField({
  label,
  required,
  error,
  trailing,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="caption-style text-fg-secondary select-none">
          {label}
          {required && (
            <span aria-hidden className="text-fg-tertiary">
              {" "}
              *
            </span>
          )}
        </span>
        {trailing}
      </div>
      {children}
      {error && (
        <span role="alert" className="caption-style text-danger leading-snug">
          {error}
        </span>
      )}
    </div>
  );
}
