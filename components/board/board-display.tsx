"use client";

import Button from "@/components/_ui/button";
import { Checkbox } from "@/components/_ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/_ui/popover";
import Tooltip from "@/components/_ui/tooltip";
import { cn } from "@/lib/utils";
import SettingsIcon from "@/public/assets/icons/settings.svg";
import type { BoardPrefs } from "./board-prefs";

export type CardField = { id: string; label: string };

/** Toolbar popover that picks which fields a board's cards show. */
export default function BoardDisplay({
  prefs,
  fields,
  className,
}: {
  prefs: BoardPrefs;
  fields: readonly CardField[];
  className?: string;
}) {
  const ids = fields.map((field) => field.id);
  return (
    <Popover>
      <Tooltip content="Show on cards">
        <PopoverTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            aria-label="Display options"
            className={cn("data-[state=open]:bg-muted shrink-0", className)}
          >
            <SettingsIcon aria-hidden className="size-3.5" />
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent className="w-52 p-2">
        <div className="flex h-7 items-center justify-between gap-2 px-2">
          <span className="caption-style text-fg-tertiary">Show on cards</span>
          {prefs.fields && (
            <Button
              variant="ghost"
              size="xs"
              className="-mr-2"
              onClick={prefs.showAllFields}
            >
              Show all
            </Button>
          )}
        </div>
        {fields.map((field) => (
          <label
            key={field.id}
            className="hover:bg-overlay-2 flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-sm leading-none"
          >
            <Checkbox
              checked={!prefs.fields || prefs.fields.includes(field.id)}
              onCheckedChange={() => prefs.toggleField(field.id, ids)}
            />
            {field.label}
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}
