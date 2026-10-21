"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button, { buttonVariants } from "@/components/_ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/_ui/dropdown-menu";
import EmptyState from "@/components/_ui/empty-state";
import { Input } from "@/components/_ui/input";
import { Label } from "@/components/_ui/label";
import SegmentedControl from "@/components/_ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/_ui/select";
import Skeleton from "@/components/_ui/skeleton";
import Tooltip from "@/components/_ui/tooltip";
import { RecordSection } from "@/components/record/record-layout";
import { formatDay } from "@/features/deals/format";
import { useViewer } from "@/hooks/use-viewer";
import { CURRENCIES, type Currency } from "@/lib/domain/money";
import {
  DEFAULT_VALIDITY_DAYS,
  MAX_LINES,
  MAX_TERMS_LENGTH,
  PROPOSAL_STATUS_LABEL,
  blankLine,
  priceLines,
  rateLabel,
  marginBand,
  type ProposalLine,
} from "@/lib/domain/pricing";
import { relativeTime, dateTime } from "@/lib/time";
import DotsIcon from "@/public/assets/icons/dots-horizontal.svg";
import EyeIcon from "@/public/assets/icons/eye.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import WalletIcon from "@/public/assets/icons/wallet.svg";
import { Amount } from "./amount";
import ApprovalPanel from "./approval";
import LineTable, { LineFooter } from "./line-table";
import { ProposalStatusTag } from "./status";
import { BrandTotals, InternalTotals } from "./totals";
import {
  useProposalActions,
  type ProposalActions,
  type ProposalRow,
} from "./use-proposals";

const newKey = () => crypto.randomUUID().slice(0, 8);

function localDay(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const BAND_TONE = {
  below_floor: "text-danger",
  low: "text-warning",
  target: undefined,
  default: "text-success",
} as const;

/** The deal desk: priced line items, the team's numbers, the brand's view and versions. */
export default function ProposalTab({
  deal,
}: {
  deal: { _id: Id<"deals">; amount: { currency: Currency } };
}) {
  const rows = useQuery(api.proposals.forDeal, { dealId: deal._id });
  const actions = useProposalActions(deal._id);
  const [selectedId, setSelectedId] = useState<Id<"proposals"> | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  async function start() {
    const line = blankLine(newKey(), deal.amount.currency);
    setStarting(true);
    const id = await actions.create(line, localDay(DEFAULT_VALIDITY_DAYS));
    setStarting(false);
    if (id) {
      setSelectedId(id);
      setFocusKey(line.key);
    }
  }

  if (rows === undefined) return <ProposalSkeleton />;

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={WalletIcon}
        title="No proposal yet"
        description="Price this deal per verified sale. Fees and margin are worked out as you type, and you choose what the brand sees."
        action={
          <Button
            variant="primary"
            size="sm"
            loading={starting}
            onClick={start}
          >
            <PlusIcon aria-hidden className="size-3" />
            Start proposal
          </Button>
        }
        className="border-border rounded-xl border border-dashed"
      />
    );
  }

  const proposal = rows.find((row) => row._id === selectedId) ?? rows[0];

  return (
    <ProposalEditor
      key={proposal._id}
      proposal={proposal}
      rows={rows}
      actions={actions}
      focusKey={focusKey}
      onFocusKey={setFocusKey}
      onSelect={setSelectedId}
    />
  );
}

function ProposalEditor({
  proposal,
  rows,
  actions,
  focusKey,
  onFocusKey,
  onSelect,
}: {
  proposal: ProposalRow;
  rows: ProposalRow[];
  actions: ProposalActions;
  focusKey: string | null;
  onFocusKey: (key: string | null) => void;
  onSelect: (id: Id<"proposals">) => void;
}) {
  const viewer = useViewer();
  const canApprove = viewer.role !== "rep";
  const draft = proposal.status === "draft";
  const pricing = priceLines(proposal.lines);
  const { total } = pricing;
  const currency = proposal.currency;
  const approved = proposal.approval?.state === "approved";
  const blocked = pricing.needsApproval && !approved;
  const latest = rows[0];
  const canStartVersion = latest.status !== "draft";
  const band = marginBand(total.margin, total.brandCharge);

  function addLine(after?: ProposalLine, index?: number) {
    const line = after
      ? { ...after, key: newKey() }
      : blankLine(newKey(), currency, proposal.lines.at(-1));
    onFocusKey(after ? null : line.key);
    void actions.addLine(proposal._id, line, index);
  }

  async function newVersion() {
    const id = await actions.create();
    if (id) onSelect(id);
  }

  const preview = (
    <Link
      href={`/proposals/${proposal._id}/print`}
      target="_blank"
      rel="noopener"
      className={buttonVariants({ variant: "secondary", size: "sm" })}
    >
      <EyeIcon aria-hidden className="size-3.5" />
      Preview
    </Link>
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          {rows.length > 1 ? (
            <div className="scrollbar-none -m-1 max-w-full overflow-x-auto p-1">
              <SegmentedControl
                label="Proposal version"
                value={proposal._id}
                onChange={(value) => onSelect(value as Id<"proposals">)}
                segments={rows.map((row) => ({
                  value: row._id,
                  label: `v${row.version}`,
                  count: PROPOSAL_STATUS_LABEL[row.status],
                }))}
              />
            </div>
          ) : (
            <span className="flex items-center gap-2">
              <span className="text-sm font-medium">v{proposal.version}</span>
              <ProposalStatusTag status={proposal.status} />
            </span>
          )}
          <span className="caption-style text-fg-tertiary">
            {proposal.status === "draft"
              ? `Started by ${proposal.createdBy?.name ?? "a teammate"} ${relativeTime(proposal._creationTime)}`
              : proposal.status === "sent"
                ? `Sent ${proposal.sentAt ? relativeTime(proposal.sentAt) : ""} · valid until ${formatDay(proposal.validUntil)}`
                : `${PROPOSAL_STATUS_LABEL[proposal.status]} ${proposal.decidedAt ? relativeTime(proposal.decidedAt) : ""}`}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {preview}
          {draft && (
            <Tooltip
              content={
                blocked
                  ? "Needs a manager's approval first"
                  : "Share the preview with the brand, then mark it sent. Sent versions are frozen."
              }
            >
              <span tabIndex={blocked ? 0 : undefined} className="rounded-full">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={blocked}
                  onClick={() => void actions.send(proposal)}
                >
                  Mark as sent
                </Button>
              </span>
            </Tooltip>
          )}
          {proposal.status === "sent" && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => void actions.accept(proposal)}
            >
              Mark accepted
            </Button>
          )}
          {!draft && proposal.status !== "sent" && canStartVersion && (
            <Button variant="secondary" size="sm" onClick={newVersion}>
              New version
            </Button>
          )}
          {(draft || proposal.status === "sent") && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Proposal actions"
                  className="data-[state=open]:bg-overlay-2 data-[state=open]:text-foreground"
                >
                  <DotsIcon aria-hidden className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                {proposal.status === "sent" && (
                  <>
                    <DropdownMenuItem
                      onSelect={() => void actions.reject(proposal)}
                    >
                      Mark rejected
                    </DropdownMenuItem>
                    {canStartVersion && (
                      <DropdownMenuItem onSelect={() => void newVersion()}>
                        New version
                      </DropdownMenuItem>
                    )}
                  </>
                )}
                {draft && (
                  <DropdownMenuItem
                    className="text-danger"
                    onSelect={() =>
                      void actions.remove(proposal, (id) => onSelect(id))
                    }
                  >
                    Delete draft
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {(draft ? pricing.needsApproval : approved) && (
        <ApprovalPanel
          proposal={proposal}
          pricing={pricing}
          canApprove={canApprove && draft}
          actions={actions}
        />
      )}

      <RecordSection
        title="Line items"
        count={proposal.lines.length}
        action={
          draft &&
          proposal.lines.length > 0 &&
          proposal.lines.length < MAX_LINES && (
            <Button variant="ghost" size="xs" onClick={() => addLine()}>
              <PlusIcon aria-hidden className="size-2.5" />
              Add line
            </Button>
          )
        }
      >
        {proposal.lines.length === 0 ? (
          <EmptyState
            title="No lines on this version"
            description="Each line is a product the creators buy, with its order value, bonus and slots per month."
            action={
              draft && (
                <Button variant="secondary" size="sm" onClick={() => addLine()}>
                  <PlusIcon aria-hidden className="size-3" />
                  Add line
                </Button>
              )
            }
            className="border-border rounded-xl border border-dashed"
          />
        ) : (
          <LineTable
            lines={proposal.lines}
            pricing={pricing}
            currency={currency}
            readOnly={!draft}
            focusKey={focusKey}
            onSave={(line, patch) =>
              void actions.updateLine(proposal._id, line.key, patch)
            }
            onDuplicate={(line, index) => addLine(line, index + 1)}
            onRemove={(line) => void actions.removeLine(proposal._id, line)}
            footer={
              <LineFooter
                stats={[
                  {
                    label: "slots / mo",
                    value: proposal.lines
                      .reduce((sum, line) => sum + line.slots, 0)
                      .toLocaleString("en-IN"),
                  },
                  {
                    label: "brand charge",
                    value: (
                      <Amount value={{ amount: total.brandCharge, currency }} />
                    ),
                  },
                  {
                    label: "take / mo",
                    value: <Amount value={{ amount: total.take, currency }} />,
                  },
                  {
                    label: "blended margin",
                    value: rateLabel(pricing.marginRate),
                    tone: BAND_TONE[band],
                  },
                ]}
              />
            }
          />
        )}
      </RecordSection>

      <div className="grid min-w-0 items-start gap-4 md:grid-cols-2">
        <InternalTotals pricing={pricing} currency={currency} />
        <BrandTotals
          lines={proposal.lines}
          pricing={pricing}
          currency={currency}
        />
      </div>

      <ProposalTerms proposal={proposal} actions={actions} />
    </div>
  );
}

function ProposalTerms({
  proposal,
  actions,
}: {
  proposal: ProposalRow;
  actions: ProposalActions;
}) {
  const draft = proposal.status === "draft";
  const [terms, setTerms] = useState(proposal.terms);
  const [synced, setSynced] = useState(proposal.terms);
  if (proposal.terms !== synced) {
    setSynced(proposal.terms);
    setTerms(proposal.terms);
  }
  const fieldId = `proposal-${proposal._id}`;

  return (
    <RecordSection title="Validity and terms">
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${fieldId}-valid`}>Valid until</Label>
            {draft ? (
              <Input
                id={`${fieldId}-valid`}
                type="date"
                value={proposal.validUntil}
                min={localDay()}
                onChange={(event) =>
                  event.target.value &&
                  void actions.update(
                    proposal,
                    { validUntil: event.target.value },
                    "Validity",
                  )
                }
              />
            ) : (
              <span id={`${fieldId}-valid`} className="text-sm leading-9">
                {formatDay(proposal.validUntil)}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${fieldId}-currency`}>Currency</Label>
            {draft ? (
              <Select
                value={proposal.currency}
                onValueChange={(currency) =>
                  void actions.update(
                    proposal,
                    { currency: currency as Currency },
                    "Currency",
                  )
                }
              >
                <SelectTrigger id={`${fieldId}-currency`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span id={`${fieldId}-currency`} className="text-sm leading-9">
                {proposal.currency}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${fieldId}-terms`}>Terms shown to the brand</Label>
          {draft ? (
            <textarea
              id={`${fieldId}-terms`}
              rows={4}
              maxLength={MAX_TERMS_LENGTH}
              value={terms}
              onChange={(event) => setTerms(event.target.value)}
              onBlur={() =>
                terms.trim() !== proposal.terms &&
                void actions.update(proposal, { terms }, "Terms")
              }
              className="border-input bg-secondary text-foreground placeholder:text-fg-tertiary focus-visible:border-selected focus-visible:ring-selected/20 duration-fast field-sizing-content max-h-80 min-h-24 w-full resize-none rounded-lg border px-3 py-2.5 text-sm leading-relaxed transition-[border-color,box-shadow] outline-none focus-visible:ring-3"
            />
          ) : (
            <p
              id={`${fieldId}-terms`}
              className="text-fg-secondary text-sm leading-relaxed whitespace-pre-line"
            >
              {proposal.terms || "No terms"}
            </p>
          )}
        </div>
        {proposal.updatedAt && (
          <span
            className="caption-style text-fg-tertiary"
            title={dateTime(proposal.updatedAt)}
          >
            Last edited {relativeTime(proposal.updatedAt)}
          </span>
        )}
      </div>
    </RecordSection>
  );
}

function ProposalSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-40 rounded-full" />
        <Skeleton className="h-7 w-48 rounded-full" />
      </div>
      <Skeleton className="h-44 w-full rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    </div>
  );
}
