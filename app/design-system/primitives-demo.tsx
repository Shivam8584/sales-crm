"use client";

import { useState, type ReactNode } from "react";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import { Card, CardHeader } from "@/components/_ui/card";
import { Checkbox } from "@/components/_ui/checkbox";
import { CollapsibleSection } from "@/components/_ui/collapsible";
import CountBadge from "@/components/_ui/count-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/_ui/dialog";
import Divider from "@/components/_ui/divider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/_ui/dropdown-menu";
import EmptyState from "@/components/_ui/empty-state";
import Field from "@/components/_ui/field";
import IconBadge from "@/components/_ui/icon-badge";
import { Input } from "@/components/_ui/input";
import Kbd from "@/components/_ui/kbd";
import SegmentedControl from "@/components/_ui/segmented-control";
import SelectField from "@/components/_ui/select-field";
import Skeleton from "@/components/_ui/skeleton";
import StatCard from "@/components/_ui/stat-card";
import { Switch } from "@/components/_ui/switch";
import Tag, { type TagTone } from "@/components/_ui/tag";
import Tooltip from "@/components/_ui/tooltip";
import Sparkline from "@/components/_common/sparkline";
import { toast } from "@/stores/toast-store";
import BellIcon from "@/public/assets/icons/bell.svg";
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";
import ClockIcon from "@/public/assets/icons/clock.svg";
import DotsIcon from "@/public/assets/icons/dots-horizontal.svg";
import FilterIcon from "@/public/assets/icons/filter.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import SearchIcon from "@/public/assets/icons/search.svg";
import UserPlusIcon from "@/public/assets/icons/user-plus.svg";
import UsersIcon from "@/public/assets/icons/users.svg";
import WalletIcon from "@/public/assets/icons/wallet.svg";

const BUTTON_VARIANTS = [
  "primary",
  "secondary",
  "muted",
  "subtle",
  "ghost",
] as const;
const TAG_TONES: TagTone[] = [
  "blue",
  "purple",
  "green",
  "moss",
  "red",
  "orange",
  "amber",
  "teal",
  "yellow",
  "neutral",
];
const ICON_TONES = [
  "neutral",
  "brand",
  "info",
  "success",
  "warning",
  "danger",
] as const;
const STATES = [
  {
    label: "Info",
    text: "Imported 42 accounts from CSV.",
    className: "bg-info-surface border-info-border text-info-foreground",
  },
  {
    label: "Success",
    text: "GSTIN verified with the registry.",
    className:
      "bg-success-surface border-success-border text-success-foreground",
  },
  {
    label: "Warning",
    text: "Lead SLA ends in 4 minutes.",
    className:
      "bg-warning-surface border-warning-border text-warning-foreground",
  },
  {
    label: "Danger",
    text: "Webhook rejected 3 events.",
    className: "bg-danger-surface border-danger-border text-danger-foreground",
  },
];
const TREND = [0, 1, 0, 2, 3, 1, 0, 4, 2, 5, 3, 0, 2, 6];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="caption-style text-fg-tertiary font-mono">{label}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {children}
      </div>
    </div>
  );
}

/** Every `_ui` primitive in its states; rendered once per theme panel. */
export default function PrimitivesDemo() {
  const [notify, setNotify] = useState(true);
  const [digest, setDigest] = useState(false);
  const [segment, setSegment] = useState("unread");
  const [stage, setStage] = useState<string>("Qualified");
  const [dialog, setDialog] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);

  return (
    <>
      <Row label="Button · variants × sizes">
        <div className="flex flex-col gap-2">
          {BUTTON_VARIANTS.map((variant) => (
            <div key={variant} className="flex flex-wrap items-center gap-2">
              <Button variant={variant} size="xs">
                XS
              </Button>
              <Button variant={variant} size="sm">
                <PlusIcon aria-hidden className="size-3" />
                {variant}
              </Button>
              <Button variant={variant} size="sm" disabled>
                Disabled
              </Button>
              <Button variant={variant} size="sm" loading>
                Loading
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Tooltip content="Search" shortcut="⌘K">
              <Button variant="secondary" size="icon" aria-label="Search">
                <SearchIcon aria-hidden className="size-3.5" />
              </Button>
            </Tooltip>
            <Button variant="ghost" size="icon-sm" aria-label="Filter">
              <FilterIcon aria-hidden className="size-3" />
            </Button>
            <Button variant="link" size="none">
              Link button
            </Button>
          </div>
        </div>
      </Row>

      <Divider />

      <Row label="Tag · tones">
        {TAG_TONES.map((tone) => (
          <Tag key={tone} tone={tone} size="sm">
            {tone}
          </Tag>
        ))}
      </Row>
      <Row label="CountBadge · Kbd · Avatar">
        <CountBadge>24</CountBadge>
        <Kbd>⌘K</Kbd>
        <Kbd>Esc</Kbd>
        {(["xs", "sm", "md", "lg", "xl"] as const).map((size) => (
          <Avatar key={size} name="Priya Iyer" size={size} />
        ))}
      </Row>

      <Row label="State surfaces">
        <div className="grid w-full gap-2 sm:grid-cols-2">
          {STATES.map((state) => (
            <div
              key={state.label}
              className={`caption-style flex items-start gap-2 rounded-xl border px-3 py-2.5 leading-snug ${state.className}`}
            >
              <span className="font-medium">{state.label}</span>
              <span>{state.text}</span>
            </div>
          ))}
        </div>
      </Row>

      <Divider />

      <Row label="IconBadge · tones × sizes">
        {ICON_TONES.map((tone) => (
          <IconBadge key={tone} icon={BellIcon} tone={tone} size="md" />
        ))}
        <IconBadge icon={UsersIcon} size="sm" />
        <IconBadge icon={UsersIcon} size="lg" />
      </Row>

      <Row label="Field · Input · SelectField">
        <div className="grid w-full gap-3 sm:grid-cols-2">
          <Field label="Company" htmlFor="ds-company" hint="As registered.">
            <Input id="ds-company" placeholder="Acme Retail Pvt Ltd" />
          </Field>
          <Field
            label="GSTIN"
            htmlFor="ds-gstin"
            error="Enter a 15-character GSTIN"
          >
            <Input
              id="ds-gstin"
              defaultValue="27AAECS"
              aria-invalid
              className="aria-invalid:border-danger"
            />
          </Field>
          <Field label="Stage" htmlFor="ds-stage">
            <SelectField
              id="ds-stage"
              value={stage}
              onChange={setStage}
              options={["Lead", "Qualified", "Demo", "Won"]}
            />
          </Field>
          <Field label="Disabled" htmlFor="ds-disabled">
            <Input id="ds-disabled" disabled defaultValue="Read only" />
          </Field>
        </div>
      </Row>

      <Row label="Switch · Checkbox · SegmentedControl">
        <label className="lead-style flex items-center gap-2.5">
          <Switch checked={notify} onCheckedChange={setNotify} />
          Notify me
        </label>
        <label className="lead-style flex items-center gap-2.5">
          <Switch checked={digest} onCheckedChange={setDigest} />
          Daily digest
        </label>
        <Switch disabled aria-label="Disabled switch" />
        <label className="lead-style flex items-center gap-2">
          <Checkbox defaultChecked />
          Selected
        </label>
        <Checkbox checked="indeterminate" aria-label="Some selected" />
        <SegmentedControl
          label="Show"
          value={segment}
          onChange={setSegment}
          segments={[
            { value: "unread", label: "Unread", count: 6 },
            { value: "all", label: "All" },
          ]}
        />
      </Row>

      <Divider />

      <Row label="StatCard">
        <div className="grid w-full gap-3 sm:grid-cols-2">
          <StatCard
            label="Completed"
            icon={CheckCircleIcon}
            iconTone="success"
            value={18}
            context="last 14 days"
            change={{ label: "+3 today", tone: "positive" }}
          >
            <Sparkline
              values={TREND}
              className="w-full gap-1 [&>span]:flex-1"
            />
          </StatCard>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                id: "leads",
                label: "Leads waiting",
                icon: UserPlusIcon,
                value: 2,
                tone: "danger" as const,
              },
              { id: "today", label: "Due today", icon: ClockIcon, value: 5 },
              {
                id: "deals",
                label: "Closing soon",
                icon: WalletIcon,
                value: 0,
              },
              {
                id: "load",
                label: "Loading",
                icon: ClockIcon,
                value: undefined,
              },
            ].map((item) => (
              <StatCard
                key={item.id}
                size="sm"
                label={item.label}
                icon={item.icon}
                iconTone={item.tone ?? "neutral"}
                value={item.value}
                valueClassName={
                  item.tone === "danger"
                    ? "text-danger"
                    : item.value === 0
                      ? "text-fg-tertiary"
                      : undefined
                }
                pressed={focus === item.id}
                onClick={() => setFocus(focus === item.id ? null : item.id)}
              />
            ))}
          </div>
        </div>
      </Row>

      <Row label="Card · CardHeader · Collapsible">
        <Card className="w-full">
          <CardHeader
            title="Round-robin"
            description="New leads rotate through every active member."
            action={
              <Button variant="secondary" size="xs">
                Include everyone
              </Button>
            }
          />
          <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
            <CollapsibleSection title="Details">
              <p className="caption-style text-fg-secondary leading-snug">
                Collapsible content animates its height and respects reduced
                motion.
              </p>
            </CollapsibleSection>
          </div>
        </Card>
        <Card className="w-full">
          <CardHeader
            tone="danger"
            title="Danger zone"
            description="Destructive actions run at once with an Undo toast."
          />
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <span className="lead-style">Archive account</span>
            <Button
              variant="subtle"
              size="xs"
              className="text-danger"
              onClick={() => toast("Account archived", () => undefined)}
            >
              Archive
            </Button>
          </div>
        </Card>
      </Row>

      <Divider />

      <Row label="Overlays">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="icon" aria-label="More actions">
              <DotsIcon aria-hidden className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-48">
            <DropdownMenuLabel>Account</DropdownMenuLabel>
            <DropdownMenuItem>
              Edit
              <Kbd className="ml-auto h-4 min-w-4 px-1">E</Kbd>
            </DropdownMenuItem>
            <DropdownMenuItem>Duplicate</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-danger">Archive</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="secondary" size="sm" onClick={() => setDialog(true)}>
          Open dialog
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => toast("Deal moved to Won", () => toast("Move undone"))}
        >
          Show toast
        </Button>
        <Dialog open={dialog} onOpenChange={setDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New account</DialogTitle>
              <DialogDescription>
                Dialogs hold create flows; editing happens inline.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 px-6 py-5">
              <Field label="Name" htmlFor="ds-dialog-name" required>
                <Input id="ds-dialog-name" placeholder="Acme Retail" />
              </Field>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDialog(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setDialog(false)}
              >
                Create account
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Row>

      <Row label="Skeleton · EmptyState">
        <div className="grid w-full gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Card>
            <EmptyState
              icon={FilterIcon}
              title="No accounts match these filters"
              description="Remove a filter or widen the activity window."
              action={
                <Button variant="secondary" size="sm">
                  Clear filters
                </Button>
              }
            />
          </Card>
        </div>
      </Row>
    </>
  );
}
