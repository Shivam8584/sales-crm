"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Skeleton from "@/components/_ui/skeleton";
import Tag from "@/components/_ui/tag";
import FilterMenu from "@/components/_common/filter-menu";
import SearchInput from "@/components/data-table/search-input";
import { PageToolbar } from "@/components/shell/page";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  PLAYBOOK_KIND_LABEL,
  PLAYBOOK_KINDS,
  type PlaybookKind,
} from "@/lib/domain/playbook";
import MessageQuestionIcon from "@/public/assets/icons/message-question.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import { KIND_TONE } from "./playbook-meta";

export type PlaybookEntry = FunctionReturnType<
  typeof api.playbook.list
>[number];

const ANY = "any";

const EMPTY_KIND: Record<PlaybookKind, [string, string]> = {
  objection: [
    "No objection answers yet",
    "Write the answer to a question buyers keep asking, so every rep gives the same one.",
  ],
  battlecard: [
    "No battlecards yet",
    "Compare Hypedrive with the alternative a buyer is weighing: where it wins, where it doesn't.",
  ],
  case_study: [
    "No case studies yet",
    "Add real customer stories here, with the customer's permission. Reps will find them by search and can copy them into messages.",
  ],
  demo: [
    "No demo playbooks yet",
    "Write a short agenda for a type of buyer, so every demo covers the same ground.",
  ],
};

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
      <PlusIcon aria-hidden className="size-3" />
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
            kind={kind}
            searching={query !== ""}
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
                  className="border-border flex flex-col gap-2 border-b px-4 py-3"
                >
                  <Skeleton className="h-3.5 w-56" />
                  <Skeleton className="h-3 w-full max-w-md" />
                </li>
              ))}
            {rows?.map((entry) => (
              <li key={entry._id} className="border-border border-b">
                <button
                  type="button"
                  onClick={() => onSelect(entry)}
                  className="hover:bg-overlay-1 focus-visible:ring-ring duration-fast flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {entry.title}
                    </span>
                    <Tag tone={KIND_TONE[entry.kind]} size="xs">
                      {PLAYBOOK_KIND_LABEL[entry.kind]}
                    </Tag>
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
  kind,
  searching,
  onClear,
  action,
}: {
  kind: string;
  searching: boolean;
  onClear: () => void;
  action: React.ReactNode;
}) {
  if (searching || kind !== ANY) {
    const [title, description] =
      !searching && kind !== ANY
        ? EMPTY_KIND[kind as PlaybookKind]
        : ["Nothing matches", "Try other words or clear the filters."];
    return (
      <EmptyState
        icon={MessageQuestionIcon}
        title={title}
        description={description}
        action={
          <>
            {action}
            <Button variant="secondary" size="sm" onClick={onClear}>
              Clear filters
            </Button>
          </>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={MessageQuestionIcon}
      title="The playbook is empty"
      description="Add the answers, comparisons and demo agendas your team keeps repeating, so reps can find them fast and copy them into messages."
      action={action}
    />
  );
}
