"use client";

import { useState, type ReactNode } from "react";
import { Command as CommandPrimitive } from "cmdk";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/_ui/popover";
import { cn } from "@/lib/utils";
import CheckIcon from "@/public/assets/icons/check-circle.svg";

export type Option = {
  value: string;
  label: string;
  icon?: ReactNode;
  hint?: string;
};

type OptionPickerProps = {
  value: string | null;
  options: Option[];
  onChange: (value: string | null) => void;
  /** Accessible name of the trigger, e.g. "Owner". */
  label: string;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Adds a "clear" choice that sets the value to null. */
  clearLabel?: string;
  disabled?: boolean;
  align?: "start" | "end";
  className?: string;
  /** Custom trigger content; defaults to the selected option. */
  children?: ReactNode;
};

/** Searchable single choice in a popover; the trigger reads like plain text until hovered. */
export default function OptionPicker({
  value,
  options,
  onChange,
  label,
  placeholder = "Empty",
  searchPlaceholder = "Search…",
  clearLabel,
  disabled,
  align = "start",
  className,
  children,
}: OptionPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  function pick(next: string | null) {
    setOpen(false);
    if (next !== value) onChange(next);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        aria-label={`${label}: ${selected?.label ?? placeholder}`}
        className={cn(
          "hover:bg-overlay-1 data-[state=open]:bg-overlay-2 focus-visible:ring-ring duration-fast -mx-1.5 flex h-7 min-w-0 items-center gap-2 rounded-md px-1.5 text-left text-sm leading-none transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none",
          className,
        )}
      >
        {children ??
          (selected ? (
            <>
              {selected.icon}
              <span className="truncate">{selected.label}</span>
            </>
          ) : (
            <span className="text-fg-tertiary truncate">{placeholder}</span>
          ))}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-64 p-0">
        <CommandPrimitive loop className="flex flex-col">
          {options.length > 7 && (
            <CommandPrimitive.Input
              autoFocus
              placeholder={searchPlaceholder}
              className="border-line-strong placeholder:text-fg-tertiary h-10 border-b bg-transparent px-3 text-sm outline-none"
            />
          )}
          <CommandPrimitive.List className="scrollbar-none max-h-72 overflow-y-auto p-1">
            <CommandPrimitive.Empty className="caption-style text-fg-tertiary py-6 text-center">
              No matches
            </CommandPrimitive.Empty>
            {options.map((option) => (
              <CommandPrimitive.Item
                key={option.value}
                value={`${option.label} ${option.hint ?? ""} ${option.value}`}
                onSelect={() => pick(option.value)}
                className="data-[selected=true]:bg-overlay-2 flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-sm leading-none outline-none"
              >
                {option.icon}
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.hint && (
                  <span className="caption-style text-fg-tertiary truncate">
                    {option.hint}
                  </span>
                )}
                {option.value === value && (
                  <CheckIcon
                    aria-hidden
                    className="text-selected size-3.5 shrink-0"
                  />
                )}
              </CommandPrimitive.Item>
            ))}
            {clearLabel && value !== null && (
              <CommandPrimitive.Item
                value={`clear ${clearLabel}`}
                onSelect={() => pick(null)}
                className="data-[selected=true]:bg-overlay-2 text-fg-tertiary flex h-8 cursor-pointer items-center rounded-md px-2 text-sm leading-none outline-none"
              >
                {clearLabel}
              </CommandPrimitive.Item>
            )}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </PopoverContent>
    </Popover>
  );
}
