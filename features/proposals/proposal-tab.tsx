"use client";

import { istToday } from "@/lib/domain/day";
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
import {
  DEFAULT_VALIDITY_DAYS,
  MAX_LINES,
  MAX_TERMS_LENGTH,
  PAYMENT_MODES,
  PAYMENT_MODE_LABEL,
  PROPOSAL_CURRENCY,
  PROPOSAL_STATUS_LABEL,
  blankLine,
  priceLines,
  rateLabel,
  marginBand,
  type PaymentMode,
  type ProposalLine,
} from "@/lib/domain/pricing";
import { relativeTime, dateTime } from "@/lib/time";
import DotsIcon from "@/public/assets/icons/dots-horizontal.svg";
import EyeIcon from "@/public/assets/icons/eye.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import WalletIcon from "@/public/assets/icons/wallet.svg";
import { Amount, editableAmount, formatAmount, parseAmount } from "./amount";
import ApprovalPanel from "./approval";
import Handoff from "./handoff";
import LineSettingsDialog from "./line-settings";
import LineTable, { LineFooter } from "./line-table";
import { ProposalStatusTag } from "./status";
import { BrandTotals, InternalTotals } from "./totals";
import {
  useProposalActions,
  type ProposalActions,
  type ProposalRow,
} from "./use-proposals";

const newKey = () => crypto.randomUUID().slice(0, 8);

const localDay = (offsetDays = 0) => istToday(offsetDays);

const BAND_TONE = {
  below_floor: "text-danger",
  target: undefined,
  default: "text-success",
} as const;

/** The deal desk: the deal's one proposal, its priced lines, the team's numbers and the brand's view. */
export default function ProposalTab({ deal }: { deal: { _id: Id<"deals"> } }) {
  const proposal = useQuery(api.proposals.forDeal, { dealId: deal._id });
  const live = useQuery(api.proposals.policy, {});
  const actions = useProposalActions(deal._id);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  async function start() {
    if (!live) return;
    const line = blankLine(newKey(), live.policy);
    setStarting(true);
    const id = await actions.create(line, localDay(DEFAULT_VALIDITY_DAYS));
    setStarting(false);
    if (id) setFocusKey(line.key);
  }

  if (proposal === undefined) return <ProposalSkeleton />;

  if (proposal === null) {
    return (
      <EmptyState
        icon={WalletIcon}
        title="No proposal yet"
        description="Price each campaign the way the platform will: fund and cut on the order, a creator bonus, coupons. Margin and take are worked out as you type, and you choose what the brand sees."
        action={
          <Button
            variant="primary"
            size="sm"
            disabled={!live}
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

  return (
    <ProposalEditor
      key={proposal._id}
      proposal={proposal}
      actions={actions}
      focusKey={focusKey}
      onFocusKey={setFocusKey}
      onRestart={() =>
        void actions.create(undefined, localDay(DEFAULT_VALIDITY_DAYS))
      }
    />
  );
}

function ProposalEditor({
  proposal,
  actions,
  focusKey,
  onFocusKey,
  onRestart,
}: {
  proposal: ProposalRow;
  actions: ProposalActions;
  focusKey: string | null;
  onFocusKey: (key: string | null) => void;
  onRestart: () => void;
}) {
  const viewer = useViewer();
  const canApprove = viewer.role !== "rep";
  const draft = proposal.status === "draft";
  const { policy } = proposal;
  const pricing = priceLines(proposal.lines, policy);
  const { total } = pricing;
  const currency = PROPOSAL_CURRENCY;
  const approved = proposal.approval?.state === "approved";
  const needsApproval = pricing.needsApproval && !approved;
  const issueCount = pricing.issues.length;
  const blocked = needsApproval || issueCount > 0;
  const band = marginBand(total.margin, total.brandCharge, policy);
  const [settingsKey, setSettingsKey] = useState<string | null>(null);
  const settingsLine =
    proposal.lines.find((line) => line.key === settingsKey) ?? null;

  function addLine(after?: ProposalLine, index?: number) {
    const line = after
      ? { ...after, key: newKey() }
      : blankLine(newKey(), policy, proposal.lines.at(-1));
    onFocusKey(after ? null : line.key);
    void actions.addLine(proposal._id, line, index);
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
          <span className="flex items-center gap-2">
            <span className="text-sm font-medium">Proposal</span>
            <ProposalStatusTag status={proposal.status} />
          </span>
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
                issueCount > 0
                  ? `Fix ${issueCount === 1 ? "the issue" : `the ${issueCount} issues`} under Internal first`
                  : needsApproval
                    ? "Needs a manager's approval first"
                    : "Share the preview with the brand, then mark it sent. You can still edit it afterwards."
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
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void actions.edit(proposal)}
              >
                Edit proposal
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void actions.accept(proposal)}
              >
                Mark accepted
              </Button>
            </>
          )}
          {proposal.status === "rejected" && (
            <Button variant="primary" size="sm" onClick={onRestart}>
              New proposal
            </Button>
          )}
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
                <DropdownMenuItem
                  onSelect={() => void actions.reject(proposal)}
                >
                  Mark rejected
                </DropdownMenuItem>
              )}
              {(proposal.status === "accepted" ||
                proposal.status === "rejected") && (
                <DropdownMenuItem
                  onSelect={() => void actions.reopen(proposal)}
                >
                  Reopen as sent
                </DropdownMenuItem>
              )}
              {draft && (
                <DropdownMenuItem
                  className="text-danger"
                  onSelect={() => void actions.remove(proposal)}
                >
                  Delete draft
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {(draft ? pricing.needsApproval : approved) && (
        <ApprovalPanel
          proposal={proposal}
          pricing={pricing}
          policy={policy}
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
            title="No lines yet"
            description="Each line is one campaign: a product, how creators earn, the pricing and how many slots."
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
            policy={policy}
            readOnly={!draft}
            focusKey={focusKey}
            onSave={(line, patch) =>
              void actions.updateLine(proposal._id, line.key, patch)
            }
            onSettings={(line) => setSettingsKey(line.key)}
            onDuplicate={(line, index) => addLine(line, index + 1)}
            onRemove={(line) => void actions.removeLine(proposal._id, line)}
            footer={
              <LineFooter
                stats={[
                  {
                    label: "slots",
                    value: proposal.lines
                      .reduce((sum, line) => sum + line.slots, 0)
                      .toLocaleString("en-IN"),
                  },
                  {
                    label: "billed",
                    value: (
                      <Amount value={{ amount: total.billed, currency }} />
                    ),
                  },
                  {
                    label: "take",
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

      <LineSettingsDialog
        line={settingsLine}
        policy={policy}
        readOnly={!draft}
        onClose={() => setSettingsKey(null)}
        onSave={(line, patch) =>
          actions.saveLine(proposal._id, line.key, patch)
        }
      />

      <div className="grid min-w-0 items-start gap-4 md:grid-cols-2">
        <InternalTotals
          lines={proposal.lines}
          pricing={pricing}
          policy={policy}
        />
        <BrandTotals lines={proposal.lines} pricing={pricing} />
      </div>

      {proposal.status === "accepted" && <Handoff id={proposal._id} />}

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
    <RecordSection title="Validity, payment and terms">
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
          <PaymentField proposal={proposal} actions={actions} />
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

function PaymentField({
  proposal,
  actions,
}: {
  proposal: ProposalRow;
  actions: ProposalActions;
}) {
  const draft = proposal.status === "draft";
  const { payment } = proposal;
  const limit = payment.creditLimit?.amount ?? null;
  const [text, setText] = useState(limit === null ? "" : editableAmount(limit));
  const [synced, setSynced] = useState(limit);
  const [error, setError] = useState<string>();
  if (limit !== synced) {
    setSynced(limit);
    setText(limit === null ? "" : editableAmount(limit));
  }
  const id = `proposal-${proposal._id}-payment`;

  function saveLimit() {
    const amount = text.trim() ? parseAmount(text) : null;
    if (text.trim() && amount === null) {
      setError("Enter an amount like 50,000");
      return;
    }
    if (amount === limit) return;
    void actions.update(
      proposal,
      {
        payment: {
          mode: "postpaid",
          ...(amount
            ? { creditLimit: { amount, currency: PROPOSAL_CURRENCY } }
            : {}),
        },
      },
      "Credit limit",
    );
  }

  if (!draft) {
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>Payment</Label>
        <span id={id} className="text-sm leading-9">
          {PAYMENT_MODE_LABEL[payment.mode]}
          {payment.mode === "postpaid" && limit !== null && (
            <span className="text-fg-secondary">
              {" "}
              · {formatAmount(limit, PROPOSAL_CURRENCY)} credit limit
            </span>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Payment</Label>
      <div className="flex gap-2">
        <Select
          value={payment.mode}
          onValueChange={(mode) =>
            void actions.update(
              proposal,
              { payment: { mode: mode as PaymentMode } },
              "Payment",
            )
          }
        >
          <SelectTrigger id={id} className="w-32 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_MODES.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {PAYMENT_MODE_LABEL[mode]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {payment.mode === "postpaid" && (
          <div className="relative min-w-0 flex-1">
            <span
              aria-hidden
              className="text-fg-tertiary pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm"
            >
              ₹
            </span>
            <Input
              aria-label="Credit limit"
              placeholder="Credit limit"
              inputMode="decimal"
              autoComplete="off"
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setError(undefined);
              }}
              onBlur={saveLimit}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              aria-invalid={error ? true : undefined}
              className="aria-invalid:border-danger pl-7 tabular-nums"
            />
          </div>
        )}
      </div>
      <span
        role={error ? "alert" : undefined}
        className={
          error
            ? "caption-style text-danger leading-snug"
            : "caption-style text-fg-tertiary leading-snug"
        }
      >
        {error ??
          (payment.mode === "prepaid"
            ? "The brand funds the wallet before launch."
            : "Charged as enrollments are approved, within the credit limit.")}
      </span>
    </div>
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
