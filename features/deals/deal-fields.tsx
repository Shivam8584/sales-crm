"use client";

import {
  useCallback,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Command as CommandPrimitive } from "cmdk";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/_ui/popover";
import OptionPicker from "@/components/fields/option-picker";
import type { DealStage } from "@/lib/domain/enums";
import { DEAL_STAGE_LABEL, personName } from "@/lib/domain/labels";
import { formatMoney, type Money } from "@/lib/domain/money";
import { readError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import CheckedIcon from "@/public/assets/icons/checkbox-checked.svg";
import UncheckedIcon from "@/public/assets/icons/checkbox.svg";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";
import { formatDay, today } from "./format";
import LostReasonDialog from "./lost-reason-dialog";
import MoneyInput from "./money-input";
import { DEAL_STAGE_OPTIONS, DealStageTag, isOpenStage } from "./stage";
import { useRemoveDeal, type DealRow } from "./use-deal-actions";
import { routes } from "@/lib/routes";

export type DealPatch = {
  title?: string;
  accountId?: Id<"accounts">;
  stage?: DealStage;
  amount?: Money;
  ownerId?: Id<"members">;
  closeDate?: string | null;
  personIds?: Id<"people">[];
  lostReason?: string | null;
};

/** `inline` editors show the error themselves, so no toast. */
export type SaveDeal = (
  patch: DealPatch,
  label: string,
  options?: { inline?: boolean },
) => Promise<string | void>;

/**
 * Saves deal fields with an Undo toast. Resolves with an error message so an
 * inline editor can stay open on a rejected value.
 */
export function useDealSave(deal: Pick<DealRow, "_id" | "title" | "stage">) {
  const update = useMutation(api.deals.update);
  return useCallback<SaveDeal>(
    async (patch, label, options) => {
      try {
        const previous = await update({ id: deal._id, patch });
        const restore = Object.fromEntries(
          Object.keys(patch).map((key) => [
            key,
            previous[key as keyof typeof previous] ?? null,
          ]),
        ) as DealPatch;
        if (restore.stage === "lost") restore.lostReason = previous.lostReason;
        if (restore.closeDate === undefined && "closeDate" in patch) {
          restore.closeDate = null;
        }
        const message =
          patch.stage && patch.stage !== deal.stage
            ? patch.stage === "won"
              ? `Won ${deal.title}`
              : patch.stage === "lost"
                ? `${deal.title} marked as lost`
                : `Moved ${deal.title} to ${DEAL_STAGE_LABEL[patch.stage]}`
            : `${label} updated`;
        toast(
          message,
          () =>
            void update({ id: deal._id, patch: restore }).catch((error) =>
              toast(readError(error).message, { tone: "danger" }),
            ),
        );
      } catch (error) {
        const { message } = readError(error, "Couldn't save that change");
        if (!options?.inline) toast(message, { tone: "danger" });
        return message;
      }
    },
    [update, deal._id, deal.title, deal.stage],
  );
}

/** Stage tag that opens the stage picker; moving to Lost asks for a reason first. */
export function DealStageControl({
  deal,
  save,
}: {
  deal: Pick<DealRow, "title" | "stage">;
  save: SaveDeal;
}) {
  const [askingReason, setAskingReason] = useState(false);
  return (
    <>
      <OptionPicker
        value={deal.stage}
        label="Stage"
        options={DEAL_STAGE_OPTIONS}
        onChange={(value) => {
          if (!value) return;
          if (value === "lost") setAskingReason(true);
          else void save({ stage: value as DealStage }, "Stage");
        }}
        className="mx-0 h-auto gap-1 px-0 hover:bg-transparent data-[state=open]:bg-transparent"
      >
        <DealStageTag stage={deal.stage} />
        <ChevronDownIcon aria-hidden className="text-fg-tertiary size-2.5" />
      </OptionPicker>
      <LostReasonDialog
        dealTitle={askingReason ? deal.title : null}
        onCancel={() => setAskingReason(false)}
        onConfirm={(lostReason) => {
          setAskingReason(false);
          void save({ stage: "lost", lostReason }, "Stage");
        }}
      />
    </>
  );
}

/** Amount shown as text; a popover holds the money input and currency. */
export function DealAmountField({
  amount,
  save,
  className,
}: {
  amount: Money;
  save: SaveDeal;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(amount);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (draft.amount === amount.amount && draft.currency === amount.currency) {
      setOpen(false);
      return;
    }
    setSaving(true);
    const message = await save({ amount: draft }, "Amount", { inline: true });
    setSaving(false);
    if (message) setError(message);
    else setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraft(amount);
          setError(null);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger
        aria-label={`Amount: ${formatMoney(amount)}. Edit amount`}
        className={cn(
          "hover:bg-overlay-1 data-[state=open]:bg-overlay-2 focus-visible:ring-ring duration-fast -mx-1.5 flex h-7 min-w-0 items-center rounded-md px-1.5 text-sm leading-none tabular-nums transition-colors outline-none focus-visible:ring-2",
          className,
        )}
      >
        <span className={cn("truncate", !amount.amount && "text-fg-tertiary")}>
          {amount.amount ? formatMoney(amount) : "Add amount"}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label
            htmlFor="deal-amount-inline"
            className="caption-style text-fg-secondary"
          >
            Expected monthly take
          </label>
          <MoneyInput
            id="deal-amount-inline"
            value={draft}
            onChange={(next) => {
              setDraft(next);
              setError(null);
            }}
            invalid={Boolean(error)}
            describedBy={error ? "deal-amount-inline-error" : undefined}
          />
          {error && (
            <span
              id="deal-amount-inline-error"
              role="alert"
              className="caption-style text-danger leading-snug"
            >
              {error}
            </span>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={saving}>
              Save
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** Close date as text; clicking swaps in a date input that saves on blur or Enter. */
export function DealCloseDateField({
  deal,
  save,
}: {
  deal: Pick<DealRow, "closeDate" | "stage">;
  save: SaveDeal;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(deal.closeDate ?? "");
  const overdue =
    isOpenStage(deal.stage) &&
    deal.closeDate !== null &&
    deal.closeDate < today();

  async function commit() {
    setEditing(false);
    if (draft === (deal.closeDate ?? "")) return;
    await save({ closeDate: draft || null }, "Close date");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        aria-label="Close date"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={onKeyDown}
        className="border-selected ring-selected/20 bg-secondary -mx-1.5 h-7 min-w-0 rounded-md border px-1.5 text-sm leading-none tabular-nums ring-3 outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(deal.closeDate ?? "");
        setEditing(true);
      }}
      aria-label={`Close date: ${deal.closeDate ? formatDay(deal.closeDate) : "none"}. Edit close date`}
      className="hover:bg-overlay-1 focus-visible:ring-ring duration-fast -mx-1.5 flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-sm leading-none tabular-nums transition-colors outline-none focus-visible:ring-2"
    >
      {deal.closeDate ? (
        <span className={cn("truncate", overdue && "text-danger")}>
          {formatDay(deal.closeDate)}
          {overdue && <span className="caption-style ml-1.5">Overdue</span>}
        </span>
      ) : (
        <span className="text-fg-tertiary">Add close date</span>
      )}
    </button>
  );
}

/** The people at the deal's account, with the ones on the deal checked. */
export function DealPeopleMenu({
  deal,
  save,
  children,
}: {
  deal: Pick<DealRow, "accountId" | "personIds">;
  save: SaveDeal;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const people = useQuery(api.people.list, { accountId: deal.accountId });

  function toggle(id: Id<"people">) {
    const next = deal.personIds.includes(id)
      ? deal.personIds.filter((item) => item !== id)
      : [...deal.personIds, id];
    void save({ personIds: next }, "People");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <CommandPrimitive loop className="flex flex-col">
          {(people?.length ?? 0) > 7 && (
            <CommandPrimitive.Input
              autoFocus
              placeholder="Search people…"
              className="border-line-strong placeholder:text-fg-tertiary h-10 border-b bg-transparent px-3 text-sm outline-none"
            />
          )}
          <CommandPrimitive.List
            aria-label="People at the account"
            className="scrollbar-none max-h-72 overflow-y-auto p-1"
          >
            {people === undefined ? (
              <p className="caption-style text-fg-tertiary py-6 text-center">
                Loading…
              </p>
            ) : people.length === 0 ? (
              <p className="caption-style text-fg-tertiary px-3 py-6 text-center leading-snug">
                No people at this account yet. Add them on the account page.
              </p>
            ) : (
              <>
                <CommandPrimitive.Empty className="caption-style text-fg-tertiary py-6 text-center">
                  No matches
                </CommandPrimitive.Empty>
                {people.map((person) => {
                  const checked = deal.personIds.includes(person._id);
                  return (
                    <CommandPrimitive.Item
                      key={person._id}
                      value={`${personName(person)} ${person.title ?? ""} ${person._id}`}
                      onSelect={() => toggle(person._id)}
                      className="data-[selected=true]:bg-overlay-2 flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm leading-none outline-none"
                    >
                      {checked ? (
                        <CheckedIcon
                          aria-hidden
                          className="text-selected size-4 shrink-0"
                        />
                      ) : (
                        <UncheckedIcon
                          aria-hidden
                          className="text-fg-tertiary size-4 shrink-0"
                        />
                      )}
                      <Avatar name={personName(person)} size="sm" />
                      <span className="min-w-0 flex-1 truncate">
                        {personName(person)}
                        {checked && (
                          <span className="sr-only">, on the deal</span>
                        )}
                      </span>
                      {person.title && (
                        <span className="caption-style text-fg-tertiary max-w-24 truncate">
                          {person.title}
                        </span>
                      )}
                    </CommandPrimitive.Item>
                  );
                })}
              </>
            )}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </PopoverContent>
    </Popover>
  );
}

/** Deletes with an Undo toast and leaves the deal's page. */
export function useDeleteDeal() {
  const router = useRouter();
  const remove = useRemoveDeal();
  return useCallback(
    (deal: { _id: Id<"deals">; title: string }, leave: boolean) => {
      if (leave) router.push(routes.deals);
      void remove(deal);
    },
    [remove, router],
  );
}
