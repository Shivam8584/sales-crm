"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import { Checkbox } from "@/components/_ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/_ui/dropdown-menu";
import Kbd from "@/components/_ui/kbd";
import Skeleton from "@/components/_ui/skeleton";
import Tooltip from "@/components/_ui/tooltip";
import { isUrgentKind, KindIcon } from "@/features/notifications/kinds";
import type { RecordType, SnoozePreset } from "@/lib/domain/notifications";
import { dateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import BuildingIcon from "@/public/assets/icons/building.svg";
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";
import ClockIcon from "@/public/assets/icons/clock.svg";
import DotsIcon from "@/public/assets/icons/dots-horizontal.svg";
import InboxIcon from "@/public/assets/icons/inbox.svg";
import MailIcon from "@/public/assets/icons/mail.svg";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import UsersIcon from "@/public/assets/icons/users.svg";
import WalletIcon from "@/public/assets/icons/wallet.svg";

type Result = FunctionReturnType<typeof api.notifications.inbox>;
export type InboxItem = Result["items"][number];
export type InboxRecord = Result["records"][string];

export const ROW_ATTR = "data-inbox-row";

const RECORD_ICON: Record<RecordType, typeof BuildingIcon> = {
  accounts: BuildingIcon,
  deals: WalletIcon,
  leads: TargetIcon,
  people: UsersIcon,
};
const RECORD_LABEL: Record<RecordType, string> = {
  accounts: "Account",
  deals: "Deal",
  leads: "Lead",
  people: "Person",
};

const WAKE = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

export function wakeLabel(at: number) {
  return WAKE.format(at);
}

export const SNOOZE_OPTIONS: {
  value: SnoozePreset;
  label: string;
  hint: string;
}[] = [
  { value: "tomorrow", label: "Tomorrow", hint: "9:00" },
  { value: "next_week", label: "Next week", hint: "Mon 9:00" },
];

export type Group = {
  key: string;
  record: InboxRecord | null;
  items: InboxItem[];
};

/** Groups by record in order of each record's newest notification; unlinked ones go last. */
export function groupByRecord(
  items: InboxItem[],
  records: Result["records"],
): Group[] {
  const groups = new Map<string, Group>();
  for (const item of items) {
    const record = item.record ? records[item.record] : undefined;
    const key = record ? item.record! : "other";
    if (!groups.has(key)) {
      groups.set(key, { key, record: record ?? null, items: [] });
    }
    groups.get(key)!.items.push(item);
  }
  const list = [...groups.values()];
  const other = list.findIndex((group) => group.key === "other");
  if (other >= 0) list.push(...list.splice(other, 1));
  return list;
}

export type RowActions = {
  open: (item: InboxItem) => void;
  done: (items: InboxItem[], done: boolean) => void;
  snooze: (items: InboxItem[], preset: SnoozePreset) => void;
  toggleRead: (item: InboxItem) => void;
  select: (item: InboxItem, on: boolean) => void;
  setCursor: (id: string) => void;
};

export function GroupHeader({ group }: { group: Group }) {
  const unread = group.items.filter((item) => !item.read).length;
  const record = group.record;
  const Icon = record ? RECORD_ICON[record.type] : InboxIcon;
  return (
    <div className="bg-background/95 border-border z-sticky sticky top-0 flex h-9 items-center gap-2 border-b px-4 backdrop-blur-sm">
      <Icon aria-hidden className="text-fg-tertiary size-3.5 shrink-0" />
      {record ? (
        <Link
          href={record.href}
          title={record.name}
          className="caption-style text-foreground focus-visible:ring-ring min-w-0 truncate rounded-sm font-medium outline-none hover:underline focus-visible:ring-2"
        >
          {record.name}
        </Link>
      ) : (
        <span className="caption-style text-foreground font-medium">Other</span>
      )}
      {record && (
        <span className="caption-style text-fg-tertiary shrink-0">
          {RECORD_LABEL[record.type]}
        </span>
      )}
      <span className="caption-style text-fg-tertiary ml-auto shrink-0 tabular-nums">
        {unread > 0
          ? `${unread} unread`
          : `${group.items.length} ${group.items.length === 1 ? "notification" : "notifications"}`}
      </span>
    </div>
  );
}

function Tile({ item }: { item: InboxItem }) {
  const urgent = isUrgentKind(item.kind);
  return (
    <span
      aria-hidden
      className={cn(
        "bg-muted shadow-hairline flex size-7 shrink-0 items-center justify-center rounded-full",
        urgent
          ? "text-danger"
          : item.kind === "mention"
            ? "text-info-foreground bg-info-surface"
            : "text-fg-secondary",
      )}
    >
      <KindIcon kind={item.kind} className="size-3.5" />
    </span>
  );
}

export function InboxRow({
  item,
  view,
  cursor,
  selected,
  selecting,
  snoozeOpen,
  onSnoozeOpenChange,
  actions,
}: {
  item: InboxItem;
  view: string;
  cursor: boolean;
  selected: boolean;
  selecting: boolean;
  snoozeOpen: boolean;
  onSnoozeOpenChange: (open: boolean) => void;
  actions: RowActions;
}) {
  const href = item.href ?? "/inbox";
  const when =
    view === "snoozed" && item.snoozedUntil
      ? { at: item.snoozedUntil, text: `Until ${wakeLabel(item.snoozedUntil)}` }
      : { at: item._creationTime, text: relativeTime(item._creationTime) };
  const done = item.done;

  return (
    <li
      data-cursor={cursor || undefined}
      data-selected={selected || undefined}
      className="group/row border-border data-[cursor]:bg-row-hover data-[selected]:bg-row-selected hover:bg-row-hover relative border-b last:border-b-0"
    >
      <span
        aria-hidden
        className="bg-selected absolute inset-y-0 left-0 w-0.5 opacity-0 group-data-[cursor]/row:opacity-100"
      />
      <Link
        href={href}
        {...{ [ROW_ATTR]: item._id }}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey) return;
          actions.open(item);
        }}
        onFocus={() => actions.setCursor(item._id)}
        className="focus-visible:ring-ring flex min-w-0 items-start gap-3 py-2.5 pr-4 pl-11 outline-none focus-visible:ring-2 focus-visible:ring-inset max-sm:pl-4 pointer-coarse:pr-10"
      >
        <Tile item={item} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span
              title={item.title}
              className={cn(
                "lead-style min-w-0 flex-1 truncate leading-5",
                item.read ? "text-fg-secondary" : "text-foreground font-medium",
              )}
            >
              {item.title}
            </span>
            {!item.read && (
              <span className="flex shrink-0">
                <span
                  aria-hidden
                  className="bg-selected size-1.5 rounded-full"
                />
                <span className="sr-only">Unread</span>
              </span>
            )}
            <time
              dateTime={new Date(when.at).toISOString()}
              title={dateTime(when.at)}
              className="caption-style text-fg-tertiary shrink-0 whitespace-nowrap tabular-nums group-focus-within/row:invisible group-hover/row:invisible group-data-[cursor]/row:invisible pointer-coarse:visible!"
            >
              {when.text}
            </time>
          </span>
          {(item.body || item.actor) && (
            <span className="caption-style text-fg-tertiary flex min-w-0 items-center gap-1.5 leading-5">
              {item.actor && (
                <Avatar name={item.actor.name} size="xs" className="shrink-0" />
              )}
              <span className="truncate" title={item.body ?? undefined}>
                {item.body ?? item.actor?.name}
              </span>
            </span>
          )}
        </span>
      </Link>

      <span
        className={cn(
          "absolute top-3.5 left-4 flex max-sm:hidden",
          !selecting &&
            !selected &&
            "opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100",
        )}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => actions.select(item, checked === true)}
          aria-label={`Select ${item.title}`}
        />
      </span>

      <span className="bg-row-hover absolute top-1.5 right-2 flex items-center gap-0.5 rounded-lg p-0.5 opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 group-data-[cursor]/row:opacity-100 has-[[data-state=open]]:opacity-100 pointer-coarse:hidden">
        <Tooltip content={done ? "Move to inbox" : "Done"} shortcut="E">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={done ? "Move to inbox" : "Mark done"}
            onClick={() => actions.done([item], !done)}
          >
            {done ? (
              <InboxIcon aria-hidden className="size-3" />
            ) : (
              <CheckCircleIcon aria-hidden className="size-3" />
            )}
          </Button>
        </Tooltip>
        {!done && (
          <SnoozeMenu
            open={snoozeOpen}
            onOpenChange={onSnoozeOpenChange}
            onSnooze={(preset) => actions.snooze([item], preset)}
          />
        )}
        <Tooltip content={item.read ? "Mark unread" : "Mark read"} shortcut="U">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={item.read ? "Mark unread" : "Mark read"}
            onClick={() => actions.toggleRead(item)}
          >
            <MailIcon aria-hidden className="size-3" />
          </Button>
        </Tooltip>
      </span>

      <span className="absolute top-2 right-2 hidden pointer-coarse:flex">
        <RowMenu item={item} actions={actions} />
      </span>
    </li>
  );
}

/** Snooze choices; `S` opens it for the row under the cursor. */
export function SnoozeMenu({
  open,
  onOpenChange,
  onSnooze,
  trigger,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSnooze: (preset: SnoozePreset) => void;
  trigger?: ReactNode;
}) {
  const [own, setOwn] = useState(false);
  const isOpen = open ?? own;
  const setOpen = (next: boolean) => {
    setOwn(next);
    onOpenChange?.(next);
  };
  return (
    <DropdownMenu open={isOpen} onOpenChange={setOpen}>
      <Tooltip content="Snooze" shortcut="S">
        <DropdownMenuTrigger asChild>
          {trigger ?? (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Snooze"
              className="data-[state=open]:bg-overlay-2"
            >
              <ClockIcon aria-hidden className="size-3" />
            </Button>
          )}
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className="min-w-52"
        onCloseAutoFocus={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          const option = SNOOZE_OPTIONS[Number(event.key) - 1];
          if (!option) return;
          event.preventDefault();
          setOpen(false);
          onSnooze(option.value);
        }}
      >
        <DropdownMenuLabel>Snooze until</DropdownMenuLabel>
        {SNOOZE_OPTIONS.map((option, index) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => onSnooze(option.value)}
          >
            <ClockIcon aria-hidden className="text-fg-tertiary size-3" />
            <span className="flex-1">{option.label}</span>
            <span className="text-fg-tertiary tabular-nums">{option.hint}</span>
            <Kbd className="ml-1">{index + 1}</Kbd>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RowMenu({ item, actions }: { item: InboxItem; actions: RowActions }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Actions for ${item.title}`}
        >
          <DotsIcon aria-hidden className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuItem onSelect={() => actions.done([item], !item.done)}>
          {item.done ? (
            <InboxIcon aria-hidden className="size-3" />
          ) : (
            <CheckCircleIcon aria-hidden className="size-3" />
          )}
          {item.done ? "Move to inbox" : "Mark done"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.toggleRead(item)}>
          <MailIcon aria-hidden className="size-3" />
          {item.read ? "Mark unread" : "Mark read"}
        </DropdownMenuItem>
        {!item.done && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Snooze until</DropdownMenuLabel>
            {SNOOZE_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onSelect={() => actions.snooze([item], option.value)}
              >
                <ClockIcon aria-hidden className="size-3" />
                <span className="flex-1">{option.label}</span>
                <span className="text-fg-tertiary">{option.hint}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function InboxSkeleton() {
  return (
    <div aria-busy className="flex flex-col">
      <div className="border-border flex h-9 items-center gap-2 border-b px-4">
        <Skeleton className="size-3.5 rounded" />
        <Skeleton className="h-3 w-32" />
      </div>
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="border-border flex items-start gap-3 border-b py-2.5 pr-4 pl-11 max-sm:pl-4"
        >
          <Skeleton className="size-7 rounded-full" />
          <span className="flex flex-1 flex-col gap-2 pt-1">
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-2.5 w-2/5" />
          </span>
        </div>
      ))}
    </div>
  );
}
