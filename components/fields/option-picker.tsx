"use client";

import { useRef, useState, type ReactNode } from "react";
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
  /**
   * Server search: called with the typed text, and `options` are shown as
   * given (already matched) instead of being filtered here.
   */
  onSearch?: (text: string) => void;
};

function optionValue(option: Option) {
  return `${option.label} ${option.hint ?? ""} ${option.value}`;
}

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
  onSearch,
}: OptionPickerProps) {
  const [open, setOpen] = useState(false);
  const commandRef = useRef<HTMLDivElement>(null);
  const searchable = Boolean(onSearch) || options.length > 7;
  const selected = options.find((option) => option.value === value);

  function toggle(next: boolean) {
    setOpen(next);
    if (!next) onSearch?.("");
  }

  function pick(next: string | null) {
    toggle(false);
    if (next !== value) onChange(next);
  }

  return (
    <Popover open={open} onOpenChange={toggle}>
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
      <PopoverContent
        align={align}
        className="w-64 p-0"
        onOpenAutoFocus={(event) => {
          // cmdk handles arrow keys on its root, so focus must start inside it.
          event.preventDefault();
          const target = searchable
            ? commandRef.current?.querySelector("input")
            : commandRef.current;
          target?.focus();
        }}
      >
        <CommandPrimitive
          ref={commandRef}
          loop
          tabIndex={-1}
          label={label}
          defaultValue={selected ? optionValue(selected) : undefined}
          shouldFilter={!onSearch}
          className="flex flex-col outline-none"
        >
          {searchable && (
            <CommandPrimitive.Input
              placeholder={searchPlaceholder}
              onValueChange={onSearch}
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
                value={optionValue(option)}
                onSelect={() => pick(option.value)}
                className="data-[selected=true]:bg-overlay-2 flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-sm leading-none outline-none data-[disabled=true]:opacity-50"
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
