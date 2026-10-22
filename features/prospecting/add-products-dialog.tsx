"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
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
import SelectField from "@/components/_ui/select-field";
import { Textarea } from "@/components/_ui/textarea";
import {
  MAX_IMPORT_URLS,
  marketplaceName,
  parseUrlList,
} from "@/lib/domain/prospecting";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";

const NEW = "new";
const MAX_FILE_BYTES = 1024 * 1024;

type Errors = Partial<Record<"watchlist" | "name" | "urls" | "form", string>>;

/** Paste or upload product links into a source; shows what will be added before saving. */
export default function AddProductsDialog({
  open,
  onOpenChange,
  watchlistId: initialWatchlist,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  watchlistId?: string | null;
}) {
  const watchlists = useQuery(
    api.prospecting.watchlists,
    open ? {} : "skip",
  )?.filter((list) => !list.inbound);
  const createWatchlist = useMutation(api.prospecting.createWatchlist);
  const addProducts = useMutation(api.prospecting.addProducts);
  const [picked, setPicked] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fallback =
    initialWatchlist &&
    watchlists?.some((list) => list._id === initialWatchlist)
      ? initialWatchlist
      : (watchlists?.[0]?._id ?? NEW);
  const target = picked ?? fallback;

  const entries = useMemo(() => parseUrlList(text), [text]);
  const ready = entries.filter((entry) => entry.status === "ready");
  const problems = entries.filter((entry) => entry.status !== "ready");
  const byMarketplace = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of ready) {
      counts.set(entry.marketplace, (counts.get(entry.marketplace) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [ready]);

  function reset() {
    setPicked(null);
    setName("");
    setText("");
    setErrors({});
  }

  async function readFile(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      setErrors({ urls: "That file is over 1 MB. Split it up." });
      return;
    }
    const content = await file.text();
    setText((current) => (current.trim() ? `${current}\n${content}` : content));
    setErrors({});
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: Errors = {};
    if (target === NEW && !name.trim()) next.name = "Name the source";
    if (ready.length === 0) {
      next.urls = entries.length
        ? "None of these links can be watched yet"
        : "Paste at least one product link";
    } else if (ready.length > MAX_IMPORT_URLS) {
      next.urls = `Add up to ${MAX_IMPORT_URLS} links at a time`;
    }
    setErrors(next);
    if (next.name) return document.getElementById("watch-name")?.focus();
    if (next.urls) return document.getElementById("watch-urls")?.focus();
    setSaving(true);
    try {
      const watchlistId =
        target === NEW
          ? await createWatchlist({ name })
          : (target as Id<"watchlists">);
      const result = await addProducts({
        watchlistId,
        urls: ready.map((entry) => entry.url),
      });
      onOpenChange(false);
      const skipped = result.duplicates + result.invalid.length;
      toast(
        result.added
          ? `Watching ${result.added} new ${result.added === 1 ? "product" : "products"}${skipped ? ` · ${skipped} already listed or unreadable` : ""}. First checks are running.`
          : "Those products are already in this source",
        { tone: result.added ? "success" : "info" },
      );
    } catch (error) {
      const { message, field } = readError(error, "Couldn't add the products");
      setErrors({
        [field === "name" ? "name" : field === "urls" ? "urls" : "form"]:
          message,
      });
    } finally {
      setSaving(false);
    }
  }

  const options = [
    ...(watchlists ?? []).map((list) => ({
      value: list._id as string,
      label: `${list.name} · ${list.products}`,
    })),
    { value: NEW, label: "New source…" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-140" onCloseAutoFocus={reset}>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Watch products</DialogTitle>
            <DialogDescription>
              Each product link is checked daily for its ratings.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 px-6 py-5">
            <div className="flex flex-col gap-4">
              <Field
                label="Source"
                htmlFor="watch-list"
                error={errors.watchlist}
              >
                <SelectField
                  id="watch-list"
                  value={target}
                  options={options}
                  onChange={setPicked}
                  disabled={watchlists === undefined}
                />
              </Field>
              {target === NEW && (
                <Field
                  label="Name"
                  htmlFor="watch-name"
                  required
                  error={errors.name}
                >
                  <Input
                    id="watch-name"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setErrors((current) => ({ ...current, name: undefined }));
                    }}
                    placeholder="Haircare competitors"
                    aria-invalid={errors.name ? true : undefined}
                    aria-describedby={
                      errors.name ? "watch-name-error" : undefined
                    }
                    autoComplete="off"
                  />
                </Field>
              )}
            </div>
            <Field
              label="Product links"
              htmlFor="watch-urls"
              error={errors.urls}
              hint="One per line, or any CSV with a column of links."
              trailing={
                <>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => fileRef.current?.click()}
                  >
                    Upload CSV
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.txt,text/csv,text/plain"
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void readFile(file);
                      event.target.value = "";
                    }}
                  />
                </>
              }
            >
              <Textarea
                id="watch-urls"
                rows={6}
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setErrors((current) => ({ ...current, urls: undefined }));
                }}
                placeholder={
                  "https://www.amazon.in/…/dp/B07W6VWY8L\nhttps://www.nykaa.com/…/p/412345"
                }
                spellCheck={false}
                aria-invalid={errors.urls ? true : undefined}
                aria-describedby={
                  errors.urls ? "watch-urls-error" : "watch-urls-hint"
                }
                className="max-h-56 min-h-32 font-mono text-xs"
              />
            </Field>
            {entries.length > 0 && (
              <div aria-live="polite" className="flex flex-col gap-2.5">
                <p className="caption-style flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-foreground font-medium tabular-nums">
                    {ready.length} ready
                  </span>
                  {byMarketplace.map(([slug, count]) => (
                    <span key={slug} className="text-fg-secondary tabular-nums">
                      {marketplaceName(slug)} {count}
                    </span>
                  ))}
                  {problems.length > 0 && (
                    <span className="text-warning tabular-nums">
                      {problems.length} skipped
                    </span>
                  )}
                </p>
                {problems.length > 0 && (
                  <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto">
                    {problems.map((entry, index) => (
                      <li
                        key={`${entry.line}-${index}`}
                        className="caption-style grid grid-cols-[3rem_minmax(0,1fr)] gap-2"
                      >
                        <span className="text-fg-tertiary tabular-nums">
                          Line {entry.line}
                        </span>
                        <span className="min-w-0">
                          <span
                            className="text-fg-secondary block truncate font-mono"
                            title={entry.input}
                          >
                            {entry.input}
                          </span>
                          <span className="text-fg-tertiary block leading-snug">
                            {entry.reason}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
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
              {ready.length
                ? `Watch ${ready.length} ${ready.length === 1 ? "product" : "products"}`
                : "Watch products"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
