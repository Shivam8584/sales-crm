"use client";

import Button from "@/components/_ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/_ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/_ui/sheet";
import Tooltip from "@/components/_ui/tooltip";
import { useMobileBreakpoints } from "@/hooks/use-mobile-breakpoints";
import { cn } from "@/lib/utils";
import DotsIcon from "@/public/assets/icons/dots-horizontal.svg";
import SidebarIcon from "@/public/assets/icons/sidebar.svg";
import XIcon from "@/public/assets/icons/kanban/x-close.svg";
import type { BoardColumnDef } from "./board";
import type { BoardPrefs } from "./board-prefs";
import ToneDot from "./tone-dot";

type HiddenColumnsProps = {
  columns: BoardColumnDef[];
  counts: Record<string, number>;
  overId: string | null;
  onShow: (column: BoardColumnDef) => void;
  onShowAll: () => void;
  onClose?: () => void;
  className?: string;
};

function HiddenColumnRow({
  column,
  count,
  over,
  onShow,
}: {
  column: BoardColumnDef;
  count: number;
  over: boolean;
  onShow: (column: BoardColumnDef) => void;
}) {
  const Icon = column.icon;
  return (
    <div
      data-hidden-column={column.id}
      className={cn(
        "duration-fast -mx-2 rounded-lg transition-colors",
        over && "bg-selected/12",
      )}
    >
      <button
        type="button"
        title={`Show ${column.name}`}
        onClick={() => onShow(column)}
        className="lead-style text-fg-secondary hover:bg-overlay-2 hover:text-foreground focus-visible:ring-ring duration-fast flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 transition-colors outline-none focus-visible:ring-2"
      >
        {Icon ? (
          <Icon
            aria-hidden
            className={cn(
              "size-3.5 shrink-0",
              over ? "text-selected" : "text-fg-tertiary",
            )}
          />
        ) : (
          <ToneDot tone={column.tone} className="mx-0.75" />
        )}
        <span className="min-w-0 flex-1 truncate text-left">{column.name}</span>
        <span className="text-fg-tertiary tabular-nums">{count}</span>
      </button>
    </div>
  );
}

function HiddenColumnsBody({
  columns,
  counts,
  overId,
  onShow,
  onShowAll,
  onClose,
  className,
}: HiddenColumnsProps) {
  return (
    <div className={cn("flex min-h-0 flex-col gap-4 p-4", className)}>
      <header className="flex h-5 items-center justify-between gap-2">
        <h2 className="lead-style truncate font-medium">Hidden columns</h2>
        <div className="-my-1 -mr-1.5 flex items-center gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Hidden columns options"
                className="data-[state=open]:bg-overlay-2 data-[state=open]:text-foreground rounded-md"
              >
                <DotsIcon aria-hidden className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={columns.length === 0}
                onSelect={onShowAll}
              >
                Show all columns
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {onClose && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close hidden columns"
              onClick={onClose}
              className="rounded-md"
            >
              <XIcon aria-hidden className="size-3.5" />
            </Button>
          )}
        </div>
      </header>
      <div className="bg-border h-px shrink-0" />
      {columns.length === 0 ? (
        <p className="caption-style text-fg-tertiary leading-snug">
          Every column is on the board. Hide one from its … menu.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {columns.map((column) => (
            <HiddenColumnRow
              key={column.id}
              column={column}
              count={counts[column.id] ?? 0}
              over={overId === column.id}
              onShow={onShow}
            />
          ))}
        </div>
      )}
      <p className="caption-style text-fg-tertiary mt-auto leading-snug">
        Drop a card on a column to move it there, or click a column to bring it
        back to the board.
      </p>
    </div>
  );
}

type HiddenColumnsPanelProps = HiddenColumnsProps & { prefs: BoardPrefs };

/** Side panel on desktop, a sheet below `lg`. */
export default function HiddenColumnsPanel({
  prefs,
  ...props
}: HiddenColumnsPanelProps) {
  const { belowLg } = useMobileBreakpoints();
  if (belowLg) {
    return (
      <Sheet open={prefs.sheetOpen} onOpenChange={prefs.setSheetOpen}>
        <SheetContent
          className="w-64 max-w-[85vw]"
          aria-describedby={undefined}
        >
          <SheetTitle className="sr-only">Hidden columns</SheetTitle>
          <SheetDescription className="sr-only">
            Columns hidden from the board
          </SheetDescription>
          <HiddenColumnsBody
            {...props}
            onClose={() => prefs.setSheetOpen(false)}
            className="flex-1"
          />
        </SheetContent>
      </Sheet>
    );
  }
  if (!prefs.panelOpen) return null;
  return (
    <aside
      aria-label="Hidden columns"
      className="border-border hidden w-52 shrink-0 border-l lg:flex"
    >
      <HiddenColumnsBody
        {...props}
        onClose={() => prefs.setPanelOpen(false)}
        className="w-full"
      />
    </aside>
  );
}

/** Toolbar button that shows the hidden columns panel; its badge counts hidden columns. */
export function HiddenColumnsToggle({
  prefs,
  className,
}: {
  prefs: BoardPrefs;
  className?: string;
}) {
  const { belowLg } = useMobileBreakpoints();
  const open = belowLg ? prefs.sheetOpen : prefs.panelOpen;
  const count = prefs.hidden.size;
  return (
    <Tooltip content={open ? "Hide hidden columns" : "Show hidden columns"}>
      <Button
        variant="secondary"
        size="icon"
        aria-label={`Hidden columns${count ? `, ${count} hidden` : ""}`}
        aria-pressed={open}
        onClick={() =>
          belowLg ? prefs.setSheetOpen(!open) : prefs.setPanelOpen(!open)
        }
        className={cn(
          "size-control-lg aria-pressed:bg-well aria-pressed:text-foreground relative shrink-0",
          className,
        )}
      >
        <SidebarIcon aria-hidden className="size-3.5 -scale-x-100" />
        {count > 0 && (
          <span className="bg-primary text-primary-foreground text-2xs absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full leading-none font-medium tabular-nums">
            {count}
          </span>
        )}
      </Button>
    </Tooltip>
  );
}
