"use client";

import { useRef, useState, type FormEvent, type SyntheticEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import AccountPicker from "@/features/accounts/account-picker";
import type { DealStage } from "@/lib/domain/enums";
import { DEAL_STAGE_LABEL } from "@/lib/domain/labels";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";

const MAX_TITLE = 120;

// The card sits inside a draggable board card; keep its events to itself.
const isolate = (event: SyntheticEvent) => event.stopPropagation();

/**
 * Inline "new deal" card at the top of a board column: Enter adds the deal
 * first in the column and keeps the card open for the next one, Esc closes.
 */
export default function DealQuickAdd({
  stage,
  accountId,
  onAccountChange,
  onClose,
}: {
  stage: DealStage;
  accountId: string | null;
  onAccountChange: (accountId: string | null) => void;
  onClose: () => void;
}) {
  const create = useMutation(api.deals.create);
  const remove = useMutation(api.deals.remove);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    if (!accountId) {
      setError("Pick an account for the deal");
      return;
    }
    setSaving(true);
    try {
      const id = await create({
        title: trimmed,
        accountId: accountId as Id<"accounts">,
        stage,
        atTop: true,
      });
      setTitle("");
      setError(null);
      inputRef.current?.focus();
      toast(`Added ${trimmed} to ${DEAL_STAGE_LABEL[stage]}`, () => {
        void remove({ id }).catch((caught) =>
          toast(readError(caught).message, { tone: "danger" }),
        );
      });
    } catch (caught) {
      setError(readError(caught, "Couldn't add the deal").message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      onClick={isolate}
      onMouseDown={isolate}
      onPointerDown={isolate}
      onTouchStart={isolate}
      onKeyDown={(event) => {
        isolate(event);
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
      aria-label={`New deal in ${DEAL_STAGE_LABEL[stage]}`}
      className="flex cursor-default flex-col gap-2.5"
    >
      <input
        ref={inputRef}
        autoFocus
        value={title}
        maxLength={MAX_TITLE}
        onChange={(event) => {
          setTitle(event.target.value);
          setError(null);
        }}
        placeholder="Deal title"
        aria-label="Deal title"
        aria-invalid={error ? true : undefined}
        className="lead-style placeholder:text-fg-tertiary min-w-0 bg-transparent font-medium outline-none"
      />
      <AccountPicker
        value={accountId}
        placeholder="Pick an account"
        onChange={(next) => {
          onAccountChange(next);
          setError(null);
        }}
        className="mx-0 -ml-1.5 w-fit max-w-full"
      />
      {error && (
        <p role="alert" className="caption-style text-danger leading-snug">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-1.5">
        <Button variant="ghost" size="xs" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="xs"
          loading={saving}
          disabled={!title.trim()}
        >
          Add deal
        </Button>
      </div>
    </form>
  );
}
