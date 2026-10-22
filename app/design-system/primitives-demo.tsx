"use client";

import { useState, type ReactNode } from "react";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import { Card, CardHeader } from "@/components/_ui/card";
import { Checkbox } from "@/components/_ui/checkbox";
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
import { Input } from "@/components/_ui/input";
import Kbd from "@/components/_ui/kbd";
import SegmentedControl from "@/components/_ui/segmented-control";
import SelectField from "@/components/_ui/select-field";
import Skeleton from "@/components/_ui/skeleton";
import { Switch } from "@/components/_ui/switch";
import Tag, { type TagTone } from "@/components/_ui/tag";
import Tooltip from "@/components/_ui/tooltip";
import { toast } from "@/stores/toast-store";
import DotsIcon from "@/public/assets/icons/dots-horizontal.svg";
import FilterIcon from "@/public/assets/icons/filter.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import SearchIcon from "@/public/assets/icons/search.svg";

const BUTTON_VARIANTS = ["primary", "secondary", "ghost"] as const;
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

      <Row label="Card · CardHeader">
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
              variant="secondary"
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
