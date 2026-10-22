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
    <div className={cn("relative w-full min-w-0 sm:w-64", className)}>
      <SearchIcon
        aria-hidden
        className="text-fg-tertiary pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2"
      />
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
        className="bg-well shadow-field hover:bg-well-hover focus-visible:bg-background focus-visible:ring-ring duration-base placeholder:text-fg-tertiary h-9 w-full min-w-0 rounded-full pr-10 pl-10 text-sm leading-none transition-[background-color] outline-none focus-visible:ring-2 pointer-coarse:h-11 pointer-coarse:text-base [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="text-fg-tertiary hover:text-foreground hover:bg-overlay-3 absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-full pointer-coarse:after:absolute pointer-coarse:after:-inset-3 pointer-coarse:after:content-['']"
        >
          <XIcon aria-hidden className="size-3" />
        </button>
      ) : (
        <Kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 max-sm:hidden">
          /
        </Kbd>
      )}
    </div>
  );
}
