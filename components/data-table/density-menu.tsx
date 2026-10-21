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
import Tooltip from "@/components/_ui/tooltip";
import { cn } from "@/lib/utils";
import {
  setTableDensity,
  useTableDensity,
  type Density,
} from "@/stores/table-density";
import ListIcon from "@/public/assets/icons/list.svg";

/** Comfortable (42px) or compact (34px) rows for every `DataTable`. */
export default function DensityMenu({
  variant = "secondary",
  className,
}: {
  /** `ghost` fits inside a table header; `secondary` fits a toolbar. */
  variant?: "secondary" | "ghost";
  className?: string;
}) {
  const density = useTableDensity();
  return (
    <DropdownMenu>
      <Tooltip content="Row density">
        <DropdownMenuTrigger asChild>
          <Button
            variant={variant}
            size={variant === "ghost" ? "icon-sm" : "icon"}
            aria-label="Row density"
            className={cn(
              variant === "ghost"
                ? "data-[state=open]:bg-overlay-2 data-[state=open]:text-foreground"
                : "data-[state=open]:bg-muted",
              className,
            )}
          >
            <ListIcon aria-hidden className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Row density</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={density}
          onValueChange={(value) => setTableDensity(value as Density)}
        >
          <DropdownMenuRadioItem value="comfortable">
            Comfortable
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="compact">Compact</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
