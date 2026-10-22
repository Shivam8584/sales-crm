"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Skeleton from "@/components/_ui/skeleton";
import FilterMenu from "@/components/_common/filter-menu";
import SearchInput from "@/components/data-table/search-input";
import { PageToolbar } from "@/components/shell/page";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  PLAYBOOK_KIND_LABEL,
  PLAYBOOK_KINDS,
  type PlaybookKind,
} from "@/lib/domain/playbook";

export type PlaybookEntry = FunctionReturnType<
  typeof api.playbook.list
>[number];

const ANY = "any";

const firstParagraph = (body: string) => body.split(/\n\s*\n/)[0].trim();

/** Search and kind filter over the playbook; the page and the in-record picker both use it. */
export default function PlaybookBrowser({
  onSelect,
  onNew,
}: {
  onSelect: (entry: PlaybookEntry) => void;
  /** Only managers and admins get a way to add entries. */
  onNew?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState(ANY);
  const query = useDebouncedValue(search.trim());
  const rows = useQuery(api.playbook.list, {
    kind: kind === ANY ? undefined : (kind as PlaybookKind),
    search: query || undefined,
  });

  const filtered = kind !== ANY || search.trim() !== "";
  const newButton = onNew && (
    <Button
      variant="primary"
      size="sm"
      onClick={onNew}
      className="h-control-md py-0"
    >
      New entry
    </Button>
  );

  function clear() {
    setSearch("");
    setKind(ANY);
  }

  return (
    <>
      <PageToolbar
        search={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search the playbook"
          />
        }
        actions={newButton}
      >
        <FilterMenu
          label="Kind"
          value={kind}
          onChange={setKind}
          options={[
            { value: ANY, label: "Any" },
            ...PLAYBOOK_KINDS.map((value) => ({
              value,
              label: PLAYBOOK_KIND_LABEL[value],
            })),
          ]}
        />
        {filtered && (
          <Button variant="ghost" size="xs" onClick={clear}>
            Clear
          </Button>
        )}
      </PageToolbar>
      <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
        {rows && rows.length === 0 ? (
          <EntriesEmpty
            filtered={filtered}
            onClear={clear}
            action={newButton}
          />
        ) : (
          <ul aria-label="Playbook" aria-busy={!rows || undefined}>
            {!rows &&
              Array.from({ length: 4 }, (_, index) => (
                <li
                  key={index}
                  aria-hidden
                  className="flex flex-col gap-2 px-4 py-3"
                >
                  <Skeleton className="h-3.5 w-56" />
                  <Skeleton className="h-3 w-full max-w-md" />
                </li>
              ))}
            {rows?.map((entry) => (
              <li key={entry._id}>
                <button
                  type="button"
                  onClick={() => onSelect(entry)}
                  className="hover:bg-overlay-1 focus-visible:ring-ring duration-fast flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {entry.title}
                    </span>
                    <span className="caption-style text-fg-tertiary shrink-0">
                      {PLAYBOOK_KIND_LABEL[entry.kind]}
                    </span>
                  </span>
                  <span className="caption-style text-fg-tertiary truncate">
                    {firstParagraph(entry.body)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function EntriesEmpty({
  filtered,
  onClear,
  action,
}: {
  filtered: boolean;
  onClear: () => void;
  action: React.ReactNode;
}) {
  return (
    <EmptyState
      title={filtered ? "Nothing matches" : "The playbook is empty"}
      action={
        filtered ? (
          <Button variant="secondary" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        ) : (
          action
        )
      }
    />
  );
}
