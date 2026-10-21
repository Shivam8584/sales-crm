"use client";

import { Suspense, useState } from "react";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import SegmentedControl from "@/components/_ui/segmented-control";
import Tag from "@/components/_ui/tag";
import Board from "@/components/board/board";
import DataTable from "@/components/data-table/data-table";
import RowAction from "@/components/data-table/row-action";
import type { Column, SortState } from "@/components/data-table/types";
import InlineText from "@/components/fields/inline-text";
import OptionPicker from "@/components/fields/option-picker";
import TagsField from "@/components/fields/tags-field";
import { Properties, Property } from "@/components/record/properties";
import RecordTabs from "@/components/record/record-tabs";
import { PageActions, PageHeader } from "@/components/shell/page";
import { toast } from "@/stores/toast-store";
import ArchiveIcon from "@/public/assets/icons/trash.svg";
import EyeIcon from "@/public/assets/icons/eye.svg";
import LinkIcon from "@/public/assets/icons/link.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import UserPlusIcon from "@/public/assets/icons/user-plus.svg";

type Row = {
  id: string;
  name: string;
  owner: string;
  stage: string;
  people: number;
};

const ROWS: Row[] = [
  {
    id: "1",
    name: "Bombay Shaving Co",
    owner: "Priya Iyer",
    stage: "Customer",
    people: 4,
  },
  {
    id: "2",
    name: "Sugar Cosmetics",
    owner: "Rohit Agarwal",
    stage: "Trial",
    people: 2,
  },
  {
    id: "3",
    name: "The Souled Store",
    owner: "Sana Qureshi",
    stage: "Prospect",
    people: 0,
  },
  {
    id: "4",
    name: "Bewakoof",
    owner: "Vikram Singh",
    stage: "Customer",
    people: 6,
  },
];

const COLUMNS: Column<Row>[] = [
  {
    id: "name",
    header: "Account",
    width: "minmax(14rem,2fr)",
    sortValue: (row) => row.name,
    cell: (row) => <span className="truncate">{row.name}</span>,
  },
  {
    id: "stage",
    header: "Stage",
    width: "minmax(8rem,1fr)",
    sortValue: (row) => row.stage,
    cell: (row) => (
      <Tag tone="neutral" size="sm">
        {row.stage}
      </Tag>
    ),
  },
  {
    id: "owner",
    header: "Owner",
    width: "minmax(10rem,1fr)",
    sortValue: (row) => row.owner,
    cell: (row) => (
      <span className="flex min-w-0 items-center gap-2">
        <Avatar name={row.owner} />
        <span className="truncate">{row.owner}</span>
      </span>
    ),
  },
  {
    id: "people",
    header: "People",
    width: "6rem",
    align: "end",
    sortValue: (row) => row.people,
    cell: (row) => row.people,
  },
];

const STAGES = [
  { value: "prospect", label: "Prospect" },
  { value: "trial", label: "Trial" },
  { value: "customer", label: "Customer" },
];

type Card = { id: string; title: string; column: string };

/** Live examples of the interactive kit, rendered on the design-system page. */
export default function KitDemo() {
  const [sort, setSort] = useState<SortState>({ id: "name", dir: "asc" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [view, setView] = useState("unread");
  const [name, setName] = useState<string | null>("Bombay Shaving Co");
  const [stage, setStage] = useState<string | null>("trial");
  const [tags, setTags] = useState(["d2c", "beauty"]);
  const [cards, setCards] = useState<Card[]>([
    { id: "a", title: "Annual plan · Sugar", column: "demo" },
    { id: "b", title: "Pilot · Bewakoof", column: "demo" },
    { id: "c", title: "Expansion · BSC", column: "proposal" },
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="border-border overflow-hidden rounded-xl border">
        <PageHeader
          navToggle={false}
          crumbs={[{ label: "Accounts", href: "/design-system" }]}
          title="Bombay Shaving Company Private Limited"
          meta={
            <span className="caption-style text-fg-tertiary">Customer</span>
          }
          actions={
            <PageActions
              primary={
                <Button variant="primary" size="sm">
                  <PlusIcon aria-hidden className="size-3" />
                  New deal
                </Button>
              }
              actions={[
                {
                  label: "Copy link",
                  icon: LinkIcon,
                  onSelect: () => toast("Link copied"),
                },
                {
                  label: "Add person",
                  icon: UserPlusIcon,
                  onSelect: () => toast("Add person"),
                },
                {
                  label: "Archive account",
                  icon: ArchiveIcon,
                  tone: "danger",
                  separated: true,
                  onSelect: () =>
                    toast("Account archived", () => toast("Restored")),
                },
              ]}
            />
          }
        />
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <SegmentedControl
            label="Show"
            value={view}
            onChange={setView}
            segments={[
              { value: "unread", label: "Unread", count: 3 },
              { value: "all", label: "All" },
            ]}
          />
          <Button variant="secondary" size="sm" onClick={() => toast("Saved")}>
            Success toast
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              toast("Deal moved to Won", () =>
                toast("Undone", { tone: "info" }),
              )
            }
          >
            Toast with undo
          </Button>
        </div>
      </div>

      <div className="border-border flex h-72 flex-col overflow-hidden rounded-xl border">
        <DataTable
          label="Example accounts"
          columns={COLUMNS}
          rows={ROWS}
          getId={(row) => row.id}
          getHref={() => "/design-system"}
          getLabel={(row) => row.name}
          renderCard={(row) => <span className="lead-style">{row.name}</span>}
          sort={sort}
          onSortChange={setSort}
          selected={selected}
          onSelectedChange={setSelected}
          keyboard={false}
          empty={null}
          rowActions={(row) => (
            <>
              <RowAction
                label="Peek"
                icon={EyeIcon}
                shortcut="Space"
                onClick={() => toast(`Peek ${row.name}`, { tone: "info" })}
              />
              <RowAction
                label="Copy link"
                icon={LinkIcon}
                onClick={() => toast("Link copied")}
              />
            </>
          )}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <Suspense>
          <RecordTabs
            tabs={[
              {
                id: "activity",
                label: "Activity",
                content: (
                  <p className="text-fg-secondary">Timeline goes here.</p>
                ),
              },
              {
                id: "people",
                label: "People",
                count: 4,
                content: (
                  <p className="text-fg-secondary">People on this account.</p>
                ),
              },
              {
                id: "deals",
                label: "Deals",
                count: 2,
                content: (
                  <p className="text-fg-secondary">Open and closed deals.</p>
                ),
              },
            ]}
          />
        </Suspense>
        <Properties title="Details">
          <Property label="Name">
            <InlineText
              value={name}
              label="Name"
              onSave={async (next) => {
                setName(next.trim() || null);
              }}
            />
          </Property>
          <Property label="Stage">
            <OptionPicker
              value={stage}
              options={STAGES}
              onChange={setStage}
              label="Stage"
            />
          </Property>
          <Property label="Tags">
            <TagsField value={tags} onChange={setTags} label="Tags" />
          </Property>
        </Properties>
      </div>

      <div className="border-border flex h-80 flex-col overflow-hidden rounded-xl border">
        <Board
          columns={[
            { id: "demo", name: "Demo", tone: "purple" },
            { id: "proposal", name: "Proposal", tone: "amber" },
            { id: "won", name: "Won", tone: "green" },
          ]}
          items={cards}
          columnOf={(card) => card.column}
          getLabel={(card) => card.title}
          renderCard={(card) => (
            <span className="lead-style">{card.title}</span>
          )}
          onMove={(id, column) =>
            setCards((current) =>
              current.map((card) =>
                card.id === id ? { ...card, column } : card,
              ),
            )
          }
          onPeek={(id) =>
            toast(`Peek ${cards.find((card) => card.id === id)?.title}`, {
              tone: "info",
            })
          }
          onOpen={(id) =>
            toast(
              `Open page for ${cards.find((card) => card.id === id)?.title}`,
              { tone: "info" },
            )
          }
        />
      </div>
    </div>
  );
}
