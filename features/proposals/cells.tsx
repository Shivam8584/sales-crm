"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Select as SelectPrimitive } from "radix-ui";
import { SelectContent, SelectItem } from "@/components/_ui/select";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

type EditableCellProps<T> = {
  label: string;
  /** Shown while the cell isn't focused. */
  display: string;
  /** Text to edit when the cell gains focus. */
  edit: string;
  parse: (text: string) => Parsed<T>;
  onCommit: (value: T) => void;
  /** True when the parsed value equals what's saved, so nothing is sent. */
  same: (value: T) => boolean;
  align?: "start" | "end";
  placeholder?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  inputMode?: "text" | "decimal" | "numeric";
  readOnly?: boolean;
  autoFocus?: boolean;
  className?: string;
};

/**
 * A spreadsheet-style cell: reads as text, edits in place. Enter or blur
 * saves, Escape restores; an invalid entry stays open with its reason.
 */
export function EditableCell<T>({
  label,
  display,
  edit,
  parse,
  onCommit,
  same,
  align = "end",
  placeholder,
  prefix,
  suffix,
  inputMode = "decimal",
  readOnly,
  autoFocus,
  className,
}: EditableCellProps<T>) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const skipBlur = useRef(false);
  const editing = draft !== null;

  function commit(text: string, onInvalid: "stay" | "revert") {
    const parsed = parse(text);
    if (!parsed.ok) {
      if (onInvalid === "stay") {
        setError(parsed.message);
        return false;
      }
      toast(parsed.message, { tone: "danger" });
    } else if (!same(parsed.value)) {
      onCommit(parsed.value);
    }
    setDraft(null);
    setError(null);
    return true;
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && draft !== null) {
      event.preventDefault();
      if (commit(draft, "stay")) {
        skipBlur.current = true;
        event.currentTarget.blur();
      }
    } else if (event.key === "Escape" && editing) {
      event.preventDefault();
      event.stopPropagation();
      setDraft(null);
      setError(null);
      skipBlur.current = true;
      event.currentTarget.blur();
    }
  }

  if (readOnly) {
    return (
      <span
        className={cn(
          "flex h-8 min-w-0 items-center gap-0.5 px-2 text-sm tabular-nums",
          align === "end" && "justify-end",
          !display && "text-fg-tertiary",
          className,
        )}
      >
        {display ? (
          <>
            {prefix}
            <span className="truncate">{display}</span>
            {suffix}
          </>
        ) : (
          placeholder
        )}
      </span>
    );
  }

  return (
    <label
      title={error ?? undefined}
      className={cn(
        "group/cell hover:bg-overlay-1 focus-within:bg-secondary focus-within:ring-selected/30 focus-within:border-selected duration-fast flex h-8 min-w-0 cursor-text items-center gap-0.5 rounded-md border border-transparent px-2 text-sm transition-[background-color,border-color] focus-within:ring-2",
        align === "end" && "justify-end",
        error && "border-danger focus-within:border-danger",
        className,
      )}
    >
      {prefix}
      <input
        aria-label={label}
        aria-invalid={error ? true : undefined}
        autoFocus={autoFocus}
        inputMode={inputMode}
        autoComplete="off"
        spellCheck={false}
        value={draft ?? display}
        placeholder={placeholder}
        onFocus={(event) => {
          setDraft(edit);
          const input = event.currentTarget;
          requestAnimationFrame(() => input.select());
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onBlur={() => {
          if (skipBlur.current) {
            skipBlur.current = false;
            return;
          }
          if (draft !== null) commit(draft, "revert");
        }}
        onKeyDown={onKeyDown}
        className={cn(
          "placeholder:text-fg-tertiary h-full min-w-0 bg-transparent tabular-nums outline-none",
          align === "end"
            ? "field-sizing-content max-w-full min-w-[1ch] text-right"
            : "w-full",
        )}
      />
      {suffix}
    </label>
  );
}

/** A compact choice inside a table cell. */
export function SelectCell<V extends string>({
  label,
  value,
  options,
  onChange,
  readOnly,
}: {
  label: string;
  value: V;
  options: { value: V; label: string }[];
  onChange: (value: V) => void;
  readOnly?: boolean;
}) {
  const selected = options.find((option) => option.value === value);
  if (readOnly) {
    return (
      <span className="flex h-8 min-w-0 items-center px-2 text-sm">
        <span className="truncate">{selected?.label}</span>
      </span>
    );
  }
  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={(next) => next !== value && onChange(next as V)}
    >
      <SelectPrimitive.Trigger
        aria-label={label}
        className="group hover:bg-overlay-1 data-[state=open]:bg-overlay-2 focus-visible:ring-ring duration-fast flex h-8 w-full min-w-0 cursor-pointer items-center justify-between gap-1.5 rounded-md px-2 text-left text-sm transition-colors outline-none focus-visible:ring-2"
      >
        <span className="truncate">
          <SelectPrimitive.Value />
        </span>
        <ChevronDownIcon
          aria-hidden
          className="text-fg-tertiary size-2.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=open]:opacity-100 pointer-coarse:opacity-100"
        />
      </SelectPrimitive.Trigger>
      <SelectContent align="start">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectPrimitive.Root>
  );
}
