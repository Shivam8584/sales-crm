"use client";

import Kbd from "@/components/_ui/kbd";
import { cn } from "@/lib/utils";
import SearchIcon from "@/public/assets/icons/search.svg";
import XIcon from "@/public/assets/icons/x.svg";

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
};

/** List filter box; `/` focuses it from anywhere on the page. */
export default function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: SearchInputProps) {
  return (
    <label
      className={cn(
        "bg-well hover:bg-well-hover focus-within:bg-background focus-within:ring-foreground/15 duration-base flex h-10 w-full min-w-0 items-center gap-2.5 rounded-full pr-2 pl-4 transition-[background-color,box-shadow] focus-within:ring-2 sm:w-64",
        className,
      )}
    >
      <SearchIcon aria-hidden className="text-fg-tertiary size-3.5 shrink-0" />
      <input
        data-list-search
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            if (value) onChange("");
            else event.currentTarget.blur();
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="placeholder:text-fg-tertiary min-w-0 flex-1 bg-transparent text-sm leading-none outline-none pointer-coarse:text-base [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="text-fg-tertiary hover:text-foreground hover:bg-overlay-3 grid size-6 place-items-center rounded-full"
        >
          <XIcon aria-hidden className="size-3" />
        </button>
      ) : (
        <Kbd className="max-sm:hidden">/</Kbd>
      )}
    </label>
  );
}
