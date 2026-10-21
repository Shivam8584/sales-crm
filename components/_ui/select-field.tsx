"use client";

import type { ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/_ui/select";
import { cn } from "@/lib/utils";

export type SelectOption<T extends string = string> =
  | T
  | { value: T; label: ReactNode; disabled?: boolean };

type SelectFieldProps<T extends string> = {
  id?: string;
  value: T | undefined;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  /** Icon or avatar before the value. */
  leading?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
};

/** A complete single-choice select from a list of options, for forms and settings. */
export default function SelectField<T extends string>({
  id,
  value,
  options,
  onChange,
  leading,
  placeholder = "Select…",
  disabled,
  className,
  ...aria
}: SelectFieldProps<T>) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as T)}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        className={cn(leading && "pl-2.5", className)}
        {...aria}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {leading}
          <span className="min-w-0 flex-1 truncate text-left">
            <SelectValue placeholder={placeholder} />
          </span>
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => {
          const item =
            typeof option === "string"
              ? { value: option, label: option, disabled: false }
              : option;
          return (
            <SelectItem
              key={item.value}
              value={item.value}
              disabled={item.disabled}
            >
              {item.label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
