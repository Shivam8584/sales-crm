"use client";

import { useEffect, useRef, type RefObject } from "react";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import FilterMenu from "@/components/_common/filter-menu";
import { Page, PageHeader, PageToolbar } from "@/components/shell/page";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useUrlState } from "@/hooks/use-url-state";
import { usePagedList } from "@/hooks/use-paged-list";
import { useMembers, useViewer } from "@/hooks/use-viewer";
import { dayStart, istDay, istToday } from "@/lib/domain/day";
import { shortDate } from "@/lib/time";
import ClockIcon from "@/public/assets/icons/clock.svg";
import {
  ActivityRow,
  ActivitySkeleton,
  type ActivityEntry,
} from "./activity-row";

const PAGE = 40;
const ANYONE = "anyone";
const ME = "me";
const ANY = "any";

const TYPES = [
  { value: "all", label: "Everything" },
  { value: "changes", label: "Changes" },
  { value: "calls", label: "Calls" },
  { value: "notes", label: "Notes" },
  { value: "system", label: "System" },
] as const;
type Type = (typeof TYPES)[number]["value"];

const RECORDS = [
  { value: "accounts", label: "Accounts" },
  { value: "people", label: "People" },
  { value: "leads", label: "Leads" },
  { value: "deals", label: "Deals" },
] as const;

const SINCE = [
  { value: ANY, label: "Any time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
] as const;
const SINCE_DAYS = { today: 0, "7d": 6, "30d": 29 } as const;

function dayLabel(at: number) {
  const day = istDay(at);
  if (day === istToday()) return "Today";
  if (day === istToday(-1)) return "Yesterday";
  return shortDate(at);
}

function groupByDay(entries: ActivityEntry[]) {
  // The feed is ordered by creation time, so backdated rows can interleave days.
  const sorted = entries.toSorted((a, b) => b.at - a.at);
  const groups: { key: string; label: string; entries: ActivityEntry[] }[] = [];
  for (const entry of sorted) {
    const key = istDay(entry.at);
    const last = groups.at(-1);
    if (last?.key === key) last.entries.push(entry);
    else groups.push({ key, label: dayLabel(entry.at), entries: [entry] });
  }
  return groups;
}

/** What changed across the CRM and who did it: team-wide, filterable, newest first. */
export default function ActivityPage() {
  const viewer = useViewer();
  const members = useMembers();
  const [typeParam, setType] = useUrlState("type", "all");
  const [who, setWho] = useUrlState("who", viewer.role === "rep" ? ME : ANYONE);
  const [record, setRecord] = useUrlState("record", ANY);
  const [since, setSince] = useUrlState("since", ANY);
  const scroller = useRef<HTMLDivElement>(null);

  const type: Type = TYPES.some((item) => item.value === typeParam)
    ? (typeParam as Type)
    : "all";
  const recordType = RECORDS.find((item) => item.value === record)?.value;
  const sinceDays = SINCE_DAYS[since as keyof typeof SINCE_DAYS];
  const actorId = who === ME ? viewer._id : who === ANYONE ? undefined : who;
  const waitingForMembers =
    actorId !== undefined && actorId !== viewer._id && !members;

  const { rows, paging } = usePagedList(
    api.activity.feed,
    waitingForMembers
      ? "skip"
      : {
          kind: type,
          actorId: actorId as Id<"members"> | undefined,
          recordType: recordType,
          since:
            sinceDays === undefined
              ? undefined
              : dayStart(istToday(-sinceDays)),
        },
    PAGE,
  );

  const defaultWho = viewer.role === "rep" ? ME : ANYONE;
  const filtered =
    type !== "all" || who !== defaultWho || record !== ANY || since !== ANY;
  function reset() {
    setType("all");
    setWho(defaultWho);
    setRecord(ANY);
    setSince(ANY);
  }

  const whoOptions = [
    { value: ANYONE, label: "Anyone" },
    { value: ME, label: "Me" },
    ...(members ?? [])
      .filter((member) => member._id !== viewer._id)
      .map((member) => ({ value: member._id, label: member.name })),
  ];
  const groups = groupByDay(rows ?? []);

  return (
    <Page>
      <PageHeader title="Activity" />
      <PageToolbar>
        <FilterMenu
          label="Type"
          value={type}
          onChange={setType}
          options={[...TYPES]}
        />
        <FilterMenu
          label="Who"
          value={who}
          onChange={setWho}
          options={whoOptions}
        />
        <FilterMenu
          label="Record"
          value={record}
          onChange={setRecord}
          options={[{ value: ANY, label: "Any" }, ...RECORDS]}
        />
        <FilterMenu
          label="Since"
          value={since}
          onChange={setSince}
          options={[...SINCE]}
        />
        {filtered && (
          <Button variant="ghost" size="xs" onClick={reset}>
            Clear
          </Button>
        )}
      </PageToolbar>

      <div
        ref={scroller}
        className="scrollbar-none min-h-0 flex-1 overflow-y-auto"
      >
        {rows === undefined ? (
          <ActivitySkeleton />
        ) : rows.length === 0 && paging.status === "Exhausted" ? (
          <EmptyState
            icon={ClockIcon}
            title={
              filtered ? "No activity matches" : "Nothing has happened yet"
            }
            description={
              filtered
                ? "Try a different type or person, or widen the dates."
                : "Field changes, logged calls and notes from the whole team show up here as they happen."
            }
            action={
              filtered && (
                <Button variant="secondary" size="sm" onClick={reset}>
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          <div
            aria-busy={paging.stale}
            className={paging.stale ? "opacity-60" : undefined}
          >
            {groups.map((group) => (
              <section key={group.key} aria-label={group.label}>
                <h2 className="bg-background/95 border-border caption-style text-foreground z-sticky sticky top-0 flex h-9 items-center border-b px-4 font-medium backdrop-blur-sm">
                  {group.label}
                </h2>
                <ul>
                  {group.entries.map((entry) => (
                    <ActivityRow key={entry._id} entry={entry} />
                  ))}
                </ul>
              </section>
            ))}
            {(paging.status === "CanLoadMore" ||
              paging.status === "LoadingMore") && (
              <LoadMore
                root={scroller}
                loading={paging.status === "LoadingMore"}
                onLoad={paging.loadMore}
              />
            )}
          </div>
        )}
      </div>
    </Page>
  );
}

/** Loads the next page as it nears the viewport; also a button for keyboards. */
function LoadMore({
  root,
  loading,
  onLoad,
}: {
  root: RefObject<HTMLElement | null>;
  loading: boolean;
  onLoad: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const load = useRef(onLoad);
  useEffect(() => {
    load.current = onLoad;
  });

  useEffect(() => {
    const element = ref.current;
    if (!element || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) load.current();
      },
      { root: root.current, rootMargin: "0px 0px 600px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [root, loading]);

  return (
    <div ref={ref} className="flex justify-center py-3">
      <Button
        variant="ghost"
        size="xs"
        disabled={loading}
        onClick={onLoad}
        className="text-fg-secondary"
      >
        {loading ? "Loading more…" : "Load more"}
      </Button>
    </div>
  );
}
