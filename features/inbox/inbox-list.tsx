"use client";

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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/_ui/dropdown-menu";
import Skeleton from "@/components/_ui/skeleton";
import Tooltip from "@/components/_ui/tooltip";
import { isUrgentKind, KindIcon } from "@/features/notifications/kinds";
import { parseRecordKey, type RecordType } from "@/lib/domain/notifications";
import { dateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import ArchiveIcon from "@/public/assets/icons/archive.svg";
import BuildingIcon from "@/public/assets/icons/building.svg";
import CheckSquareIcon from "@/public/assets/icons/check-square.svg";
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

const TASK_LINK: Record<
  RecordType,
  "accountId" | "personId" | "dealId" | "leadId"
> = {
  accounts: "accountId",
  people: "personId",
  deals: "dealId",
  leads: "leadId",
};

export type Group = {
  key: string;
  record: InboxRecord | null;
  items: InboxItem[];
};

/** Groups by record in order of each record's first notification; unlinked ones go last. */
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
  archive: (items: InboxItem[], archived: boolean) => void;
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
  cursor,
  selected,
  selecting,
  actions,
}: {
  item: InboxItem;
  cursor: boolean;
  selected: boolean;
  selecting: boolean;
  actions: RowActions;
}) {
  const href = item.href ?? "/inbox";
  const archived = item.archived;

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
              dateTime={new Date(item._creationTime).toISOString()}
              title={dateTime(item._creationTime)}
              className="caption-style text-fg-tertiary shrink-0 whitespace-nowrap tabular-nums group-focus-within/row:invisible group-hover/row:invisible group-data-[cursor]/row:invisible pointer-coarse:visible!"
            >
              {relativeTime(item._creationTime)}
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
        <Tooltip content={archived ? "Move to inbox" : "Archive"} shortcut="E">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={archived ? "Move to inbox" : "Archive"}
            onClick={() => actions.archive([item], !archived)}
          >
            {archived ? (
              <InboxIcon aria-hidden className="size-3" />
            ) : (
              <ArchiveIcon aria-hidden className="size-3" />
            )}
          </Button>
        </Tooltip>
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
        <RowMenu item={item} actions={actions} />
      </span>

      <span className="absolute top-2 right-2 hidden pointer-coarse:flex">
        <RowMenu item={item} actions={actions} />
      </span>
    </li>
  );
}

function RowMenu({ item, actions }: { item: InboxItem; actions: RowActions }) {
  const setCreate = useUiStore((state) => state.setCreate);
  const record = item.record ? parseRecordKey(item.record) : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Actions for ${item.title}`}
          className="data-[state=open]:bg-overlay-2"
        >
          <DotsIcon aria-hidden className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-52"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuItem
          onSelect={() => actions.archive([item], !item.archived)}
        >
          {item.archived ? (
            <InboxIcon aria-hidden className="size-3" />
          ) : (
            <ArchiveIcon aria-hidden className="size-3" />
          )}
          {item.archived ? "Move to inbox" : "Archive"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.toggleRead(item)}>
          <MailIcon aria-hidden className="size-3" />
          {item.read ? "Mark unread" : "Mark read"}
        </DropdownMenuItem>
        {record && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() =>
                setCreate({ type: "task", [TASK_LINK[record.type]]: record.id })
              }
            >
              <CheckSquareIcon aria-hidden className="size-3" />
              Create follow-up task
            </DropdownMenuItem>
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
