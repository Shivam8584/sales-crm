"use client";

import { useState, type KeyboardEvent } from "react";
import Tag from "@/components/_ui/tag";
import XIcon from "@/public/assets/icons/x.svg";

type TagsFieldProps = {
  value: string[];
  onChange: (tags: string[]) => void;
  label: string;
};

/** Removable chips plus an input that adds a tag on Enter or comma. */
export default function TagsField({ value, onChange, label }: TagsFieldProps) {
  const [draft, setDraft] = useState("");

  function add() {
    const tag = draft.trim();
    setDraft("");
    if (!tag || value.some((item) => item.toLowerCase() === tag.toLowerCase()))
      return;
    onChange([...value, tag]);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add();
    } else if (event.key === "Backspace" && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    } else if (event.key === "Escape" && draft) {
      event.preventDefault();
      event.stopPropagation();
      setDraft("");
    }
  }

  return (
    <div className="focus-within:bg-overlay-1 hover:bg-overlay-1 duration-fast -mx-1.5 flex min-h-7 min-w-0 flex-wrap items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors">
      {value.map((tag) => (
        <Tag key={tag} size="sm" className="gap-1 pr-1">
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => onChange(value.filter((item) => item !== tag))}
            className="text-fg-tertiary hover:text-foreground focus-visible:ring-ring rounded-full p-0.5 outline-none focus-visible:ring-2"
          >
            <XIcon aria-hidden className="size-2.5" />
          </button>
        </Tag>
      ))}
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={add}
        aria-label={`Add ${label.toLowerCase()}`}
        placeholder={value.length ? "" : "Add tag"}
        className="placeholder:text-fg-tertiary min-w-16 flex-1 bg-transparent text-sm leading-none outline-none"
      />
    </div>
  );
}
