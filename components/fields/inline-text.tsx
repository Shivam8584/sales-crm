"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

type InlineTextProps = {
  value: string | null;
  /** Resolves with an error message to keep the editor open, or nothing on success. */
  onSave: (value: string) => Promise<string | void>;
  label: string;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "url";
  /** Renders the read-only value, e.g. as a link. Defaults to the text. */
  display?: (value: string) => React.ReactNode;
  className?: string;
  inputClassName?: string;
};

/** Text that turns into an input on click; Enter or blur saves, Escape cancels. */
export default function InlineText({
  value,
  onSave,
  label,
  placeholder = "Empty",
  type = "text",
  display,
  className,
  inputClassName,
}: InlineTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function start() {
    setDraft(value ?? "");
    setError(null);
    setEditing(true);
  }

  async function commit() {
    if (saving) return;
    if (draft.trim() === (value ?? "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const message = await onSave(draft);
    setSaving(false);
    if (message) {
      setError(message);
      inputRef.current?.focus();
      return;
    }
    setEditing(false);
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
      <span className={cn("flex min-w-0 flex-col gap-1", className)}>
        <input
          ref={inputRef}
          type={type}
          value={draft}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          disabled={saving}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onBlur={() => void commit()}
          onKeyDown={onKeyDown}
          className={cn(
            "border-selected ring-selected/20 bg-secondary aria-invalid:border-danger aria-invalid:ring-danger/20 -mx-1.5 h-7 min-w-0 rounded-md border px-1.5 text-sm leading-none ring-3 outline-none",
            inputClassName,
          )}
        />
        {error && (
          <span role="alert" className="caption-style text-danger leading-snug">
            {error}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className={cn("group/inline flex min-w-0 items-center", className)}>
      <button
        type="button"
        onClick={start}
        aria-label={`Edit ${label}`}
        className={cn(
          "hover:bg-overlay-1 focus-visible:ring-ring duration-fast -mx-1.5 flex h-7 min-w-0 flex-1 items-center rounded-md px-1.5 text-left text-sm leading-none transition-colors outline-none focus-visible:ring-2",
          inputClassName,
        )}
      >
        <span className={cn("truncate", !value && "text-fg-tertiary")}>
          {value ? (display ? display(value) : value) : placeholder}
        </span>
      </button>
    </span>
  );
}
