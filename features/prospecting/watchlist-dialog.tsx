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
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";

export type WatchlistDraft = {
  _id?: Id<"watchlists">;
  name: string;
  benchmark: number | null;
};

type Errors = Partial<Record<"name" | "benchmark" | "form", string>>;

/** Create a source, or rename one and set its ratings benchmark. */
export default function WatchlistDialog({
  draft,
  onClose,
}: {
  draft: WatchlistDraft | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={draft !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-110">
        {draft && <WatchlistForm draft={draft} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function WatchlistForm({
  draft,
  onClose,
}: {
  draft: WatchlistDraft;
  onClose: () => void;
}) {
  const create = useMutation(api.prospecting.createWatchlist);
  const update = useMutation(api.prospecting.updateWatchlist);
  const [name, setName] = useState(draft.name);
  const [benchmark, setBenchmark] = useState(
    draft.benchmark === null ? "" : String(draft.benchmark),
  );
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const digits = benchmark.replace(/[,\s]/g, "");
    const next: Errors = {};
    if (!name.trim()) next.name = "Name the source";
    if (digits && !/^\d+$/.test(digits)) {
      next.benchmark = "Enter a whole number of ratings";
    }
    setErrors(next);
    if (next.name || next.benchmark) return;
    const value = digits ? Number(digits) : null;
    setSaving(true);
    try {
      if (draft._id) {
        const previous = await update({
          id: draft._id,
          name,
          benchmark: value,
        });
        const id = draft._id;
        toast("Source saved", () => void update({ id, ...previous }));
      } else {
        await create({ name, benchmark: value ?? undefined });
        toast(`${name.trim()} created`);
      }
      onClose();
    } catch (error) {
      const { message, field } = readError(error, "Couldn't save");
      setErrors({
        [field === "name" || field === "benchmark" ? field : "form"]: message,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{draft._id ? "Edit source" : "New source"}</DialogTitle>
        <DialogDescription>
          Group competing products, such as one category on one marketplace.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4 px-6 py-5">
        <Field
          label="Name"
          htmlFor="watchlist-name"
          required
          error={errors.name}
        >
          <Input
            id="watchlist-name"
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            placeholder="Haircare competitors"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "watchlist-name-error" : undefined}
            autoComplete="off"
          />
        </Field>
        <Field
          label="Ratings benchmark"
          htmlFor="watchlist-benchmark"
          error={errors.benchmark}
          hint="Leave empty to use the median of each category's leaders."
        >
          <Input
            id="watchlist-benchmark"
            value={benchmark}
            inputMode="numeric"
            onChange={(event) => setBenchmark(event.target.value)}
            placeholder="Auto"
            aria-invalid={errors.benchmark ? true : undefined}
            aria-describedby={
              errors.benchmark
                ? "watchlist-benchmark-error"
                : "watchlist-benchmark-hint"
            }
            className="tabular-nums"
            autoComplete="off"
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
          {draft._id ? "Save" : "Create source"}
        </Button>
      </DialogFooter>
    </form>
  );
}
