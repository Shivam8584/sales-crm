"use client";

import { useState, type ReactNode } from "react";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/_ui/popover";
import TagsField from "@/components/fields/tags-field";

/** Edits a row's tags in place: the trigger shows them, the popover changes them. */
export function TagsPopover({
  value,
  onChange,
  label,
  children,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${label}: edit`}
        className="hover:bg-overlay-2 focus-visible:ring-ring -mx-1 flex min-w-0 cursor-pointer items-center rounded-md px-1 py-0.5 outline-none focus-visible:ring-2"
      >
        {children}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <TagsField value={value} onChange={onChange} label={label} />
      </PopoverContent>
    </Popover>
  );
}

/** A selection-bar action that adds one tag to every selected row. */
export function BulkTag({ onAdd }: { onAdd: (tag: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" className="text-foreground">
          Add tag
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-64 p-2">
        <form
          className="flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            const tag = draft.trim();
            if (!tag) return;
            onAdd(tag);
            setDraft("");
            setOpen(false);
          }}
        >
          <Input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Tag name"
            aria-label="Tag name"
          />
          <Button
            type="submit"
            variant="secondary"
            size="control"
            disabled={!draft.trim()}
          >
            Add
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
