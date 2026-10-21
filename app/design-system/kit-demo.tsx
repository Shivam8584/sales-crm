"use client";

import { Suspense, useState } from "react";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/_ui/sheet";
import Tag from "@/components/_ui/tag";
import Tooltip from "@/components/_ui/tooltip";
import FilterMenu from "@/components/_common/filter-menu";
import SegmentBar from "@/components/_common/segment-bar";
import Sparkline from "@/components/_common/sparkline";
import Board from "@/components/board/board";
import DataTable from "@/components/data-table/data-table";
import DensityMenu from "@/components/data-table/density-menu";
import RowAction from "@/components/data-table/row-action";
import SearchInput from "@/components/data-table/search-input";
import type { Column, SortState } from "@/components/data-table/types";
import InlineText from "@/components/fields/inline-text";
import OptionPicker from "@/components/fields/option-picker";
import TagsField from "@/components/fields/tags-field";
import {
  BigNumber,
  DetailHero,
  DetailSection,
  MeterRow,
  Properties,
  Property,
  RecordTabs,
  StatTile,
} from "@/components/record";
import {
  CreateButton,
  ExportButton,
  PageActions,
  PageHeader,
  PageStatus,
  PageToolbar,
  PageViews,
} from "@/components/shell/page";
import SidebarNavItem from "@/components/shell/sidebar/sidebar-nav-item";
import SidebarSection from "@/components/shell/sidebar/sidebar-section";
import { toast } from "@/stores/toast-store";
import Logo from "@/public/assets/images/_common/logo.svg";
import ActivityIcon from "@/public/assets/icons/activity.svg";
import ArchiveIcon from "@/public/assets/icons/trash.svg";
import BellIcon from "@/public/assets/icons/bell.svg";
import BuildingIcon from "@/public/assets/icons/building.svg";
import CalendarIcon from "@/public/assets/icons/calendar.svg";
import CheckSquareIcon from "@/public/assets/icons/check-square.svg";
import CursorClickIcon from "@/public/assets/icons/cursor-click.svg";
import EyeIcon from "@/public/assets/icons/eye.svg";
import HelpIcon from "@/public/assets/icons/message-question.svg";
import InboxIcon from "@/public/assets/icons/inbox.svg";
import LinkIcon from "@/public/assets/icons/link.svg";
import MailIcon from "@/public/assets/icons/mail-03.svg";
import PhoneCallIcon from "@/public/assets/icons/phone-call.svg";
import SearchIcon from "@/public/assets/icons/search.svg";
import SettingsIcon from "@/public/assets/icons/settings.svg";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import UserPlusIcon from "@/public/assets/icons/user-plus.svg";
import UsersIcon from "@/public/assets/icons/users.svg";
import XIcon from "@/public/assets/icons/x.svg";

type Row = {
  id: string;
  name: string;
  owner: string;
  stage: string;
  tone: "green" | "blue" | "neutral";
  deals: number;
  pipeline: number;
  progress: number;
  trend: number[];
};

const ROWS: Row[] = [
  {
    id: "1",
    name: "Bombay Shaving Co",
    owner: "Priya Iyer",
    stage: "Activated",
    tone: "green",
    deals: 2,
    pipeline: 240000,
    progress: 100,
    trend: [0, 1, 0, 2, 3, 1, 0, 0, 4, 2, 1, 3, 2, 5],
  },
  {
    id: "2",
    name: "Sugar Cosmetics",
    owner: "Rohit Agarwal",
    stage: "Live",
    tone: "blue",
    deals: 1,
    pipeline: 95000,
    progress: 83,
    trend: [1, 0, 0, 1, 0, 2, 1, 0, 0, 1, 3, 0, 1, 1],
  },
  {
    id: "3",
    name: "The Souled Store",
    owner: "Sana Qureshi",
    stage: "Prospect",
    tone: "neutral",
    deals: 0,
    pipeline: 0,
    progress: 0,
    trend: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    id: "4",
    name: "Bewakoof",
    owner: "Vikram Singh",
    stage: "Funded",
    tone: "green",
    deals: 1,
    pipeline: 120000,
    progress: 67,
    trend: [0, 2, 2, 1, 0, 3, 4, 2, 0, 1, 0, 2, 3, 2],
  },
];

const inr = new Intl.NumberFormat("en-IN");

function Money({ amount }: { amount: number }) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-fg-tertiary">₹</span>
      {inr.format(amount)}
    </span>
  );
}

const COLUMNS: Column<Row>[] = [
  {
    id: "name",
    header: "Account",
    width: "minmax(12rem,2fr)",
    sortValue: (row) => row.name,
    cell: (row) => <span className="truncate">{row.name}</span>,
  },
  {
    id: "stage",
    header: "Stage",
    width: "minmax(7rem,1fr)",
    sortValue: (row) => row.stage,
    cell: (row) => <Tag tone={row.tone}>{row.stage}</Tag>,
  },
  {
    id: "owner",
    header: "Owner",
    width: "minmax(9rem,1fr)",
    sortValue: (row) => row.owner,
    cell: (row) => (
      <span className="flex min-w-0 items-center gap-2">
        <Avatar name={row.owner} />
        <span className="truncate">{row.owner}</span>
      </span>
    ),
  },
  {
    id: "pipeline",
    header: "Pipeline value",
    width: "8rem",
    align: "end",
    defaultDir: "desc",
    sortValue: (row) => row.pipeline,
    cell: (row) => <Money amount={row.pipeline} />,
  },
  {
    id: "progress",
    header: "Activation",
    width: "9rem",
    align: "end",
    minViewport: 900,
    sortValue: (row) => row.progress,
    cell: (row) => (
      <span className="flex items-center gap-2">
        <SegmentBar percent={row.progress} className="w-18.5" />
        <span className="w-[4ch] text-right">{row.progress}%</span>
      </span>
    ),
  },
  {
    id: "trend",
    header: "Activity trend",
    width: "7.5rem",
    minViewport: 900,
    cell: (row) => <Sparkline values={row.trend} />,
  },
];

const STAGES = [
  { value: "prospect", label: "Prospect" },
  { value: "trial", label: "Trial" },
  { value: "customer", label: "Customer" },
];

type Card = { id: string; title: string; column: string };

/** Static stand-in for the header's search, notifications and account buttons, which need a session. */
function GlobalActionsPreview() {
  return (
    <>
      <span aria-hidden className="bg-border h-4 w-px max-sm:hidden" />
      <Tooltip content="Search" shortcut="⌘ K">
        <Button variant="secondary" size="icon" aria-label="Search">
          <SearchIcon aria-hidden className="size-3.5" />
        </Button>
      </Tooltip>
      <Button
        variant="secondary"
        size="icon"
        aria-label="Notifications, 3 unread"
      >
        <BellIcon aria-hidden className="size-3.5" />
        <span
          aria-hidden
          className="bg-danger ring-secondary absolute top-1.75 right-1.75 size-1.5 rounded-full ring-2"
        />
      </Button>
      <Button
        variant="secondary"
        size="avatar"
        className="max-sm:size-control-md max-sm:p-0"
      >
        <Avatar name="Priya Iyer" />
        <span className="max-sm:hidden">Priya Iyer</span>
      </Button>
    </>
  );
}

/** Live examples of the interactive kit, rendered on the design-system page. */
export default function KitDemo() {
  return (
    <Suspense>
      <KitDemoContent />
    </Suspense>
  );
}

function KitDemoContent() {
  const [sort, setSort] = useState<SortState>({ id: "name", dir: "asc" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [view, setView] = useState("all");
  const [owner, setOwner] = useState("all");
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState<string | null>("Bombay Shaving Co");
  const [stage, setStage] = useState<string | null>("trial");
  const [tags, setTags] = useState(["d2c", "beauty"]);
  const [cards, setCards] = useState<Card[]>([
    { id: "a", title: "Annual plan · Sugar", column: "demo" },
    { id: "b", title: "Pilot · Bewakoof", column: "demo" },
    { id: "c", title: "Expansion · BSC", column: "proposal" },
  ]);

  const rows = ROWS.filter(
    (row) =>
      (view === "all" || (view === "open" ? row.deals > 0 : row.deals === 0)) &&
      (owner === "all" || row.owner === owner) &&
      row.name.toLowerCase().includes(search.toLowerCase()),
  );
  const pipeline = rows.reduce((sum, row) => sum + row.pipeline, 0);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <h3 className="text-fg-secondary">Sidebar</h3>
        <div className="border-border bg-sidebar flex w-63.5 flex-col overflow-hidden rounded-xl border">
          <div className="border-sidebar-border bg-sidebar-accent flex h-14.5 items-center gap-2 border-b px-3">
            <Logo aria-hidden className="size-8 shrink-0 overflow-visible" />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="lead-style font-medium tracking-[-0.01em]">
                Hypedrive
              </span>
              <span className="caption-style text-fg-tertiary">
                Brand pipeline
              </span>
            </span>
          </div>
          <nav aria-label="Example navigation">
            <SidebarSection className="border-sidebar-border border-b">
              <SidebarNavItem
                href="/design-system"
                icon={ActivityIcon}
                label="Today"
              />
              <SidebarNavItem
                href="/design-system"
                icon={InboxIcon}
                label="Inbox"
                count={4}
                countLabel="unread"
                alert
                active
              />
              <SidebarNavItem
                href="/design-system"
                icon={CheckSquareIcon}
                label="Tasks"
                count={2}
                countLabel="overdue"
                alert
              />
            </SidebarSection>
            <SidebarSection
              title="Records"
              className="border-sidebar-border border-b"
            >
              <SidebarNavItem
                href="/design-system"
                icon={BuildingIcon}
                label="Accounts"
                count={241}
                countLabel="accounts"
              />
              <SidebarNavItem
                href="/design-system"
                icon={UsersIcon}
                label="People"
              />
              <SidebarNavItem
                href="/design-system"
                icon={TargetIcon}
                label="Leads"
                count={12}
                countLabel="new"
                alert
              />
            </SidebarSection>
            <SidebarSection>
              <SidebarNavItem
                href="/design-system"
                icon={SettingsIcon}
                label="Settings"
                tone="quiet"
              />
              <SidebarNavItem
                href="/design-system"
                icon={UserPlusIcon}
                label="Invite teammates"
                tone="quiet"
              />
              <SidebarNavItem
                icon={HelpIcon}
                label="Help & shortcuts"
                tone="quiet"
                onClick={() => toast("Opens the shortcuts dialog")}
              />
            </SidebarSection>
          </nav>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-fg-secondary">
          Page · PageHeader, PageStatus, PageViews, PageToolbar, DataTable with
          footer
        </h3>
        <div className="border-border flex h-[34rem] flex-col overflow-hidden rounded-xl border">
          <PageHeader
            navToggle={false}
            globalActions={false}
            title="Accounts"
            meta={<PageStatus>{ROWS.length} active</PageStatus>}
            actions={
              <>
                <PageActions
                  label="Account list actions"
                  actions={[
                    {
                      label: "Import CSV",
                      onSelect: () => toast("Import CSV"),
                    },
                    {
                      label: "Copy link",
                      icon: LinkIcon,
                      onSelect: () => toast("Link copied"),
                    },
                  ]}
                />
                <GlobalActionsPreview />
              </>
            }
          />
          <PageViews
            value={view}
            onChange={setView}
            views={[
              { id: "all", label: "All", count: ROWS.length },
              {
                id: "open",
                label: "With open deals",
                count: ROWS.filter((row) => row.deals > 0).length,
              },
              {
                id: "none",
                label: "No deals",
                count: ROWS.filter((row) => row.deals === 0).length,
              },
            ]}
          />
          <PageToolbar
            actions={
              <>
                <ExportButton onClick={() => toast("Exported 4 accounts")} />
                <CreateButton onClick={() => toast("New account")}>
                  New account
                </CreateButton>
              </>
            }
          >
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search accounts"
            />
            <FilterMenu
              label="Owner"
              value={owner}
              onChange={setOwner}
              options={[
                { value: "all", label: "Anyone" },
                ...ROWS.map((row) => ({ value: row.owner, label: row.owner })),
              ]}
            />
          </PageToolbar>
          <div className="relative flex min-h-0 flex-1 flex-col">
            <DataTable
              label="Example accounts"
              columns={COLUMNS}
              rows={rows}
              getId={(row) => row.id}
              getHref={() => "/design-system"}
              getLabel={(row) => row.name}
              renderCard={(row) => (
                <span className="flex items-center justify-between gap-3">
                  <span className="lead-style truncate font-medium">
                    {row.name}
                  </span>
                  <Tag tone={row.tone}>{row.stage}</Tag>
                </span>
              )}
              sort={sort}
              onSortChange={setSort}
              selected={selected}
              onSelectedChange={setSelected}
              onPeek={() => setSheetOpen(true)}
              keyboard={false}
              empty={
                <p className="text-fg-tertiary text-center">
                  No accounts match.
                </p>
              }
              rowActions={(row) => (
                <RowAction
                  label="Log call"
                  icon={PhoneCallIcon}
                  onClick={() => toast(`Log call for ${row.name}`)}
                />
              )}
              rowMenu={(row) => [
                {
                  label: "Archive",
                  icon: ArchiveIcon,
                  tone: "danger",
                  onSelect: () =>
                    toast(`Archived ${row.name}`, () => toast("Restored")),
                },
              ]}
              footer={[
                { label: "Accounts in view", value: rows.length },
                {
                  label: "Pipeline",
                  value: <Money amount={pipeline} />,
                },
                {
                  label: "Avg activation",
                  value: `${rows.length ? Math.round(rows.reduce((sum, row) => sum + row.progress, 0) / rows.length) : 0}%`,
                },
                {
                  label: "Open deals",
                  value: rows.reduce((sum, row) => sum + row.deals, 0),
                },
              ]}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="caption-style text-fg-tertiary">
            Density toggle for toolbars:
          </span>
          <DensityMenu />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-fg-secondary">
          Detail sheet · DetailHero, DetailSection, BigNumber, MeterRow,
          StatTile
        </h3>
        <div className="flex flex-wrap items-start gap-6">
          <div className="border-line-strong bg-background w-full max-w-140 overflow-hidden rounded-xl border">
            <DetailPreview />
          </div>
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>
            <EyeIcon aria-hidden className="size-3" />
            Open as a sheet
          </Button>
        </div>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="sm:w-140 sm:max-w-140">
            <SheetHeader>
              <SheetTitle icon={BuildingIcon}>Account details</SheetTitle>
              <SheetDescription className="sr-only">
                Example detail sheet
              </SheetDescription>
              <SheetClose asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Close">
                  <XIcon aria-hidden className="size-3.5" />
                </Button>
              </SheetClose>
            </SheetHeader>
            <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
              <DetailPreview />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-fg-secondary">
          Record page · RecordTabs and Properties
        </h3>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
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
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-fg-secondary">Board</h3>
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
    </div>
  );
}

function DetailPreview() {
  const [range, setRange] = useState("14");
  return (
    <>
      <DetailHero
        visual={
          <span className="bg-logo-tile text-logo-tile-fg shadow-tile flex size-12 items-center justify-center rounded-xl text-lg font-semibold">
            B
          </span>
        }
        title="Bombay Shaving Co"
      >
        <Tag tone="green" size="sm">
          Activated
        </Tag>
        <Tag tone="purple" size="sm">
          Grooming
        </Tag>
      </DetailHero>
      <DetailSection title="Account summary">
        <div className="lead-style flex flex-wrap items-center gap-x-4 gap-y-3">
          <span className="flex items-center gap-1.5 font-medium">
            <Avatar name="Priya Iyer" />
            Priya Iyer
          </span>
          <span className="text-fg-secondary">
            priya@bombayshavingcompany.com
          </span>
        </div>
      </DetailSection>
      <DetailSection title="Activation">
        <BigNumber value="67%" caption="4 of 6 activation steps done" />
        <div className="flex flex-col gap-3">
          <MeterRow label="Onboarding" percent={100} tone="success" />
          <MeterRow
            label="First campaign"
            percent={50}
            value="1 of 2"
            tone="warning"
          />
        </div>
      </DetailSection>
      <DetailSection
        title="Activity trend"
        divider={false}
        action={
          <FilterMenu
            value={range}
            onChange={setRange}
            align="end"
            options={[
              { value: "14", label: "Last 14 days" },
              { value: "30", label: "Last 30 days" },
            ]}
          />
        }
      >
        <BigNumber
          size="md"
          value={24}
          caption="Timeline entries in the last 14 days"
          trend={ROWS[0].trend}
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile icon={CursorClickIcon} label="Total touches" value={24} />
          <StatTile icon={MailIcon} label="Emails" value={10} />
          <StatTile icon={CalendarIcon} label="Meetings" value={3} />
          <StatTile icon={PhoneCallIcon} label="Calls & notes" value={7} />
        </div>
      </DetailSection>
    </>
  );
}
