"use client";

import Button from "@/components/_ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/_ui/dropdown-menu";
import { cn } from "@/lib/utils";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";

export type FilterOption = { value: string; label: string };

type FilterMenuProps = {
  label?: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  align?: "start" | "end";
  className?: string;
};

export default function FilterMenu({
  label,
  value,
  options,
  onChange,
  align = "start",
  className,
}: FilterMenuProps) {
  const current = options.find((option) => option.value === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="well"
          size="toolbar"
          className={cn(
            "group data-[state=open]:bg-well-hover gap-1.5 px-4 font-normal",
            className,
          )}
        >
          {label && <span className="text-fg-tertiary">{label}</span>}
          <span className="flex items-center gap-1.5 font-medium">
            {current?.label ?? value}
            <ChevronDownIcon
              aria-hidden
              className="text-fg-tertiary duration-settle ease-out-hd size-3 transition-transform group-data-[state=open]:rotate-180"
            />
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {label && <DropdownMenuLabel>{label}</DropdownMenuLabel>}
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
