"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
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
import Skeleton from "@/components/_ui/skeleton";
import OptionPicker from "@/components/fields/option-picker";
import AccountPicker from "@/features/accounts/account-picker";
import MemberPicker from "@/features/members/member-picker";
import { useViewer } from "@/hooks/use-viewer";
import { DEAL_STAGES, type DealStage } from "@/lib/domain/enums";
import { DEFAULT_CURRENCY, type Money } from "@/lib/domain/money";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import { useUiStore, type CreateDialog } from "@/stores/ui-store";
import PlusIcon from "@/public/assets/icons/plus.svg";
import TrashIcon from "@/public/assets/icons/trash.svg";
import { LostReasonChips } from "./lost-reason-dialog";
import MoneyInput from "./money-input";
import PeoplePicker from "./people-picker";
import { DEAL_STAGE_OPTIONS } from "./stage";
import { useRemoveDeal, type DealRow } from "./use-deal-actions";

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

type Target =
  | { mode: "create"; preset: Extract<CreateDialog, { type: "deal" }> }
  | { mode: "edit"; id: Id<"deals"> };

const PICKER_CLASS =
  "border-input bg-secondary mx-0 h-9 w-full rounded-lg border px-3";

/** Create and edit dialog for deals, driven by `useUiStore` create/edit state. */
export default function DealDialog() {
  const create = useUiStore((state) => state.create);
  const edit = useUiStore((state) => state.edit);
  const setCreate = useUiStore((state) => state.setCreate);
  const setEdit = useUiStore((state) => state.setEdit);

  const target: Target | null =
    create?.type === "deal"
      ? { mode: "create", preset: create }
      : edit?.type === "deal"
        ? { mode: "edit", id: edit.id as Id<"deals"> }
        : null;

  // Keep rendering the last target while the dialog animates out.
  const [shown, setShown] = useState<Target | null>(target);
  const [session, setSession] = useState(0);
  const [lastSource, setLastSource] = useState<unknown>(null);
  const source = create?.type === "deal" ? create : edit;
  if (target && source !== lastSource) {
    setLastSource(source);
    setShown(target);
    setSession((count) => count + 1);
  } else if (!target && lastSource !== null) {
    setLastSource(null);
  }

  function close() {
    if (create?.type === "deal") setCreate(null);
    if (edit?.type === "deal") setEdit(null);
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-130">
        {shown?.mode === "create" && (
          <DealForm key={session} preset={shown.preset} onDone={close} />
        )}
        {shown?.mode === "edit" && (
          <EditDeal
            key={session}
            id={shown.id}
            open={target !== null}
            onDone={close}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditDeal({
  id,
  open,
  onDone,
}: {
  id: Id<"deals">;
  open: boolean;
  onDone: () => void;
}) {
  const deal = useQuery(api.deals.get, { id });

  useEffect(() => {
    if (open && deal === null) {
      toast("That deal no longer exists");
      onDone();
    }
  }, [open, deal, onDone]);

  if (!deal) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit deal</DialogTitle>
          <DialogDescription>Loading the deal…</DialogDescription>
        </DialogHeader>
        <div aria-busy className="flex flex-col gap-4 px-6 py-5">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-9 w-full rounded-lg" />
          ))}
        </div>
      </>
    );
  }
  return <DealForm deal={deal} onDone={onDone} />;
}

function isStage(value: string | undefined): value is DealStage {
  return (DEAL_STAGES as readonly string[]).includes(value ?? "");
}

function sameIds(a: string[], b: string[]) {
  return a.length === b.length && a.every((id) => b.includes(id));
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

function DealForm({
  deal,
  preset,
  onDone,
}: {
  deal?: DealRow;
  preset?: Extract<CreateDialog, { type: "deal" }>;
  onDone: () => void;
}) {
  const viewer = useViewer();
  const createDeal = useMutation(api.deals.create);
  const updateDeal = useMutation(api.deals.update);
  const removeCreated = useMutation(api.deals.remove);
  const removeDeal = useRemoveDeal();
  const editing = deal !== undefined;

  const [initial] = useState<Form>(() =>
    deal
      ? {
          title: deal.title,
          accountId: deal.accountId,
          stage: deal.stage,
          amount: deal.amount,
          ownerId: deal.ownerId,
          closeDate: deal.closeDate ?? "",
          personIds: deal.personIds,
          lostReason: deal.lostReason ?? "",
        }
      : {
          title: "",
          accountId: preset?.accountId ?? null,
          stage: isStage(preset?.stage) ? preset.stage : "discovery",
          amount: { amount: 0, currency: DEFAULT_CURRENCY },
          ownerId: viewer._id,
          closeDate: "",
          personIds: [],
          lostReason: "",
        },
  );
  const [form, setForm] = useState(initial);
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>(
    {},
  );
  const [saving, setSaving] = useState(false);

  const errors = validate(form);
  const valid = Object.keys(errors).length === 0;
  const changed = changedFields(initial, form);
  const dirty = changed.length > 0;
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
    if (!valid || !dirty || saving) return;
    const title = form.title.trim();
    setSaving(true);
    try {
      if (deal) {
        const patch = buildPatch(form, changed);
        const previous = await updateDeal({ id: deal._id, patch });
        const undoPatch = Object.fromEntries(
          Object.keys(patch).map((key) => [
            key,
            previous[key as keyof typeof previous],
          ]),
        ) as typeof patch;
        if (undoPatch.stage === "lost")
          undoPatch.lostReason = previous.lostReason;
        const undo = () =>
          void updateDeal({ id: deal._id, patch: undoPatch }).catch((error) =>
            toast(readError(error).message),
          );
        toast(
          patch.stage === "won" && deal.stage !== "won"
            ? `Won ${title}`
            : `Saved ${title}`,
          undo,
        );
      } else {
        const id = await createDeal({
          title,
          accountId: form.accountId as Id<"accounts">,
          stage: form.stage,
          amount: form.amount,
          ownerId: form.ownerId as Id<"members">,
          closeDate: form.closeDate || undefined,
          personIds: form.personIds as Id<"people">[],
          lostReason:
            form.stage === "lost" ? form.lostReason.trim() : undefined,
        });
        toast(`Created ${title}`, () => {
          void removeCreated({ id }).catch((error) =>
            toast(readError(error).message),
          );
        });
      }
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

  function remove() {
    if (!deal) return;
    onDone();
    void removeDeal(deal);
  }

  const titleError = shown("title");
  const amountError = shown("amount");
  const closeDateError = shown("closeDate");
  const reasonError = shown("lostReason");

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? "Edit deal" : "New deal"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Update the details, or move it to another stage."
            : "An opportunity with an account, tracked through the pipeline."}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4 px-6 py-5">
        <Field label="Title" htmlFor="deal-title" required error={titleError}>
          <Input
            id="deal-title"
            autoFocus={!editing}
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

        <PickerField
          label="Account"
          required
          error={shown("accountId")}
          trailing={
            editing &&
            form.accountId && (
              <Button
                variant="link"
                size="none"
                className="caption-style"
                href={`/accounts/${form.accountId}`}
                onClick={onDone}
              >
                Open account
              </Button>
            )
          }
        >
          <AccountPicker
            value={form.accountId}
            currentName={deal?.account?.name}
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

        <div className="grid gap-4 sm:grid-cols-2">
          <PickerField label="Stage">
            <OptionPicker
              value={form.stage}
              label="Stage"
              options={DEAL_STAGE_OPTIONS}
              onChange={(value) => value && set("stage", value as DealStage)}
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
              placeholder="What happened?"
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

        <div className="grid gap-4 sm:grid-cols-2">
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
              describedBy={
                amountError ? "deal-amount-error" : "deal-amount-hint"
              }
            />
          </Field>
          <PickerField label="Owner">
            <MemberPicker
              value={form.ownerId}
              currentName={deal?.owner?.name}
              onChange={(ownerId) => set("ownerId", ownerId)}
              className={PICKER_CLASS}
            />
          </PickerField>
        </div>

        <Field
          label="Contacts"
          htmlFor="deal-contacts"
          hint="People at the account you're working with on this deal."
        >
          <PeoplePicker
            id="deal-contacts"
            accountId={form.accountId}
            value={form.personIds}
            onChange={(ids) => set("personIds", ids)}
            describedBy="deal-contacts-hint"
          />
        </Field>

        {serverErrors.form && (
          <p role="alert" className="caption-style text-danger">
            {serverErrors.form}
          </p>
        )}
      </div>

      <DialogFooter className={editing ? "justify-between" : undefined}>
        {editing && (
          <Button
            variant="ghost"
            size="sm"
            className="hover:text-danger -ml-2.25"
            onClick={remove}
          >
            <TrashIcon aria-hidden className="size-3.5" />
            Delete
          </Button>
        )}
        <div className="flex items-center gap-2">
          <DialogClose asChild>
            <Button variant="subtle" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={saving}
            disabled={!valid || !dirty}
          >
            {!editing && <PlusIcon aria-hidden className="size-3" />}
            {editing ? "Save changes" : "Create deal"}
          </Button>
        </div>
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

function changedFields(initial: Form, form: Form) {
  return (Object.keys(form) as (keyof Form)[]).filter((key) => {
    if (key === "lostReason" && form.stage !== "lost") return false;
    if (key === "title" || key === "lostReason") {
      return form[key].trim() !== initial[key].trim();
    }
    if (key === "amount") {
      return (
        form.amount.amount !== initial.amount.amount ||
        form.amount.currency !== initial.amount.currency
      );
    }
    if (key === "personIds") return !sameIds(form.personIds, initial.personIds);
    return form[key] !== initial[key];
  });
}

function buildPatch(form: Form, changed: (keyof Form)[]) {
  const patch: {
    title?: string;
    accountId?: Id<"accounts">;
    stage?: DealStage;
    amount?: Money;
    ownerId?: Id<"members">;
    closeDate?: string | null;
    personIds?: Id<"people">[];
    lostReason?: string | null;
  } = {};
  for (const key of changed) {
    if (key === "title") patch.title = form.title.trim();
    if (key === "accountId") patch.accountId = form.accountId as Id<"accounts">;
    if (key === "stage") patch.stage = form.stage;
    if (key === "amount") patch.amount = form.amount;
    if (key === "ownerId") patch.ownerId = form.ownerId as Id<"members">;
    if (key === "closeDate") patch.closeDate = form.closeDate || null;
    if (key === "personIds") patch.personIds = form.personIds as Id<"people">[];
    if (key === "lostReason" && form.stage === "lost") {
      patch.lostReason = form.lostReason.trim();
    }
  }
  if (patch.stage === "lost") patch.lostReason = form.lostReason.trim();
  return patch;
}
