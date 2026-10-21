"use client";

import { useState } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Avatar from "@/components/_ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/_ui/popover";
import { personName } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";
import UncheckedIcon from "@/public/assets/icons/checkbox.svg";
import CheckedIcon from "@/public/assets/icons/checkbox-checked.svg";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";

type PeoplePickerProps = {
  id: string;
  accountId: string | null;
  value: string[];
  onChange: (ids: string[]) => void;
  describedBy?: string;
};

/** Multi-select of the people who work at one account. */
export default function PeoplePicker({
  id,
  accountId,
  value,
  onChange,
  describedBy,
}: PeoplePickerProps) {
  const [open, setOpen] = useState(false);
  const people = useQuery(
    api.people.list,
    accountId ? { accountId: accountId as Id<"accounts"> } : "skip",
  );
  const selected = (people ?? []).filter((person) =>
    value.includes(person._id),
  );
  const empty = people !== undefined && people.length === 0;
  const disabled = !accountId || empty;

  function toggle(personId: string) {
    onChange(
      value.includes(personId)
        ? value.filter((item) => item !== personId)
        : [...value, personId],
    );
  }

  const summary = !accountId
    ? "Pick an account first"
    : people === undefined
      ? "Loading…"
      : empty
        ? "No people at this account yet"
        : selected.length === 0
          ? "Add contacts"
          : selected.map(personName).join(", ");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        aria-describedby={describedBy}
        className="group border-input bg-secondary duration-fast ease-power3-out focus-visible:border-selected focus-visible:ring-selected/20 data-[state=open]:border-selected flex h-9 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-3 text-left text-sm leading-none transition-[border-color,box-shadow] outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {selected.length > 0 && (
          <span className="flex shrink-0 -space-x-1">
            {selected.slice(0, 3).map((person) => (
              <Avatar
                key={person._id}
                name={personName(person)}
                size="sm"
                className="ring-secondary ring-2"
              />
            ))}
          </span>
        )}
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            selected.length === 0 && "text-fg-tertiary",
          )}
        >
          {summary}
        </span>
        <ChevronDownIcon
          aria-hidden
          className="text-fg-tertiary duration-base ease-power3-out size-3 shrink-0 transition-transform group-data-[state=open]:rotate-180"
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-64 p-0"
      >
        <CommandPrimitive loop className="flex flex-col">
          {(people?.length ?? 0) > 7 && (
            <CommandPrimitive.Input
              autoFocus
              placeholder="Search people…"
              className="border-line-strong placeholder:text-fg-tertiary h-10 border-b bg-transparent px-3 text-sm outline-none"
            />
          )}
          <CommandPrimitive.List
            aria-label="Contacts"
            className="scrollbar-none max-h-72 overflow-y-auto p-1"
          >
            <CommandPrimitive.Empty className="caption-style text-fg-tertiary py-6 text-center">
              No matches
            </CommandPrimitive.Empty>
            {(people ?? []).map((person) => {
              const checked = value.includes(person._id);
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
                    {checked && <span className="sr-only">, added</span>}
                  </span>
                  {person.title && (
                    <span className="caption-style text-fg-tertiary max-w-28 truncate">
                      {person.title}
                    </span>
                  )}
                </CommandPrimitive.Item>
              );
            })}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </PopoverContent>
    </Popover>
  );
}
