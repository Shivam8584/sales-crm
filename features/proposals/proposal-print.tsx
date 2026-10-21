"use client";

import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Skeleton from "@/components/_ui/skeleton";
import MembershipGate from "@/features/auth/membership-gate";
import type { Currency } from "@/lib/domain/money";
import {
  MARKETPLACE_LABEL,
  bpsLabel,
  priceLines,
  type LinePricing,
  type ProposalLine,
} from "@/lib/domain/pricing";
import Logo from "@/public/assets/images/_common/logo.svg";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";
import ClipboardIcon from "@/public/assets/icons/clipboard.svg";
import { Amount } from "./amount";
import { ProposalStatusTag } from "./status";

const PAGE_CSS = `@page { size: A4; margin: 14mm; }`;

const LONG_DATE = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * The proposal as the brand receives it, ready to print or save as PDF.
 * Fees and margin never appear here; itemised lines show only what the brand
 * pays for.
 */
export default function ProposalPrint({ id }: { id: string }) {
  return (
    <MembershipGate>
      <PrintView id={id} />
    </MembershipGate>
  );
}

function PrintView({ id }: { id: string }) {
  const proposal = useQuery(api.proposals.get, { id });

  if (proposal === null) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <EmptyState
          icon={ClipboardIcon}
          title="This proposal doesn't exist"
          description="It may have been deleted, or the link is wrong."
          action={
            <Button variant="secondary" size="sm" href="/deals">
              Back to deals
            </Button>
          }
        />
      </main>
    );
  }

  const backHref = proposal?.deal
    ? `/deals/${proposal.deal._id}?tab=proposal`
    : "/deals";

  return (
    <main className="bg-background min-h-dvh print:bg-transparent">
      <style>{PAGE_CSS}</style>
      <div className="border-border bg-background/90 z-sticky-header sticky top-0 border-b backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 max-w-[210mm] items-center gap-3 px-4">
          <Button
            variant="ghost"
            size="icon"
            href={backHref}
            aria-label="Back to the deal"
          >
            <ChevronDownIcon aria-hidden className="size-3 rotate-90" />
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h1 className="truncate text-base">
              {proposal ? `Proposal v${proposal.version}` : "Proposal"}
              {proposal?.account && (
                <span className="text-fg-tertiary font-normal">
                  {" "}
                  · {proposal.account.name}
                </span>
              )}
            </h1>
            {proposal && <ProposalStatusTag status={proposal.status} />}
          </div>
          <Button
            variant="primary"
            size="sm"
            disabled={!proposal}
            onClick={() => window.print()}
          >
            Print or save PDF
          </Button>
        </div>
      </div>
      <div className="px-3 py-6 sm:px-6 sm:py-10 print:p-0">
        {proposal === undefined ? (
          <PaperSkeleton />
        ) : (
          <Document proposal={proposal} />
        )}
      </div>
    </main>
  );
}

type PrintProposal = NonNullable<FunctionReturnType<typeof api.proposals.get>>;

function Document({ proposal }: { proposal: PrintProposal }) {
  const pricing = priceLines(proposal.lines);
  const currency = proposal.currency;
  const issued = LONG_DATE.format(proposal.sentAt ?? proposal.updatedAt);
  const validUntil = LONG_DATE.format(
    new Date(`${proposal.validUntil}T00:00:00`),
  );
  const marketplaces = [
    ...new Set(
      proposal.lines.map((line) => MARKETPLACE_LABEL[line.marketplace]),
    ),
  ];
  const terms = proposal.terms
    .split("\n")
    .map((term) => term.trim())
    .filter(Boolean);

  return (
    <article
      data-theme="light"
      aria-label={`Proposal v${proposal.version}`}
      className="bg-card text-foreground shadow-overlay mx-auto flex max-w-[210mm] flex-col gap-10 rounded-xl px-6 py-8 [print-color-adjust:exact] sm:px-12 sm:py-12 print:max-w-none print:rounded-none print:bg-transparent print:p-0 print:shadow-none"
    >
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <Logo aria-hidden className="size-10 overflow-visible" />
          <span className="flex flex-col gap-1">
            <span className="text-lg leading-none font-semibold tracking-[-0.01em]">
              Hypedrive
            </span>
            <span className="caption-style text-fg-tertiary">
              Creator-driven verified sales
            </span>
          </span>
        </div>
        <dl className="caption-style grid grid-cols-[auto_auto] gap-x-4 gap-y-2 sm:text-right">
          <dt className="text-fg-tertiary">Proposal</dt>
          <dd className="text-foreground flex items-center gap-1.5 font-medium sm:justify-end">
            v{proposal.version}
            {proposal.status === "draft" && (
              <ProposalStatusTag status="draft" />
            )}
          </dd>
          <dt className="text-fg-tertiary">Issued</dt>
          <dd className="text-foreground">{issued}</dd>
          <dt className="text-fg-tertiary">Valid until</dt>
          <dd className="text-foreground">{validUntil}</dd>
        </dl>
      </header>

      <section className="border-border grid gap-6 border-y py-6 sm:grid-cols-2">
        <Party label="Prepared for">
          <span className="font-medium">
            {proposal.account?.name ?? "Your brand"}
          </span>
          {proposal.deal && (
            <span className="text-fg-secondary">{proposal.deal.title}</span>
          )}
        </Party>
        <Party label="Prepared by">
          <span className="font-medium">
            {proposal.preparedBy?.name ?? "Hypedrive"}
          </span>
          {proposal.preparedBy && (
            <span className="text-fg-secondary">
              {proposal.preparedBy.email}
            </span>
          )}
        </Party>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-display leading-tight font-medium text-balance">
          Pay only for verified sales
        </h2>
        <p className="text-fg-secondary max-w-[60ch] text-base leading-relaxed">
          Creators buy your product
          {marketplaces.length > 0 && ` on ${listFormat(marketplaces)}`}, share
          it with their audience, and are paid once the sale is verified.
          You&apos;re billed per verified sale, with no retainer.
        </p>
      </section>

      <section aria-label="Pricing" className="flex flex-col">
        <div className="caption-style text-fg-tertiary border-border grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-b pb-2 sm:grid-cols-[minmax(0,1fr)_6rem_8.5rem_8.5rem]">
          <span>Product</span>
          <span className="text-right max-sm:hidden">Sales / month</span>
          <span className="text-right max-sm:hidden">Per verified sale</span>
          <span className="text-right">Monthly</span>
        </div>
        {proposal.lines.map((line, index) => (
          <PrintLine
            key={line.key}
            line={line}
            pricing={pricing.lines[index]}
            currency={currency}
          />
        ))}
        <div className="flex items-end justify-between gap-4 pt-5">
          <span className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Monthly total</span>
            <span className="caption-style text-fg-tertiary">
              Excludes GST, which is added on the invoice
            </span>
          </span>
          <span className="text-2xl font-medium">
            <Amount value={{ amount: pricing.total.brandCharge, currency }} />
          </span>
        </div>
      </section>

      {terms.length > 0 && (
        <section className="flex break-inside-avoid flex-col gap-3">
          <h2 className="eyebrow-style text-fg-secondary">Terms</h2>
          <ol className="text-fg-secondary flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-relaxed">
            {terms.map((term, index) => (
              <li key={index}>{term}</li>
            ))}
          </ol>
        </section>
      )}

      <footer className="caption-style text-fg-tertiary border-border flex flex-wrap justify-between gap-2 border-t pt-5">
        <span>Hypedrive · hypedrive.in</span>
        <span>
          Valid until {validUntil}
          {proposal.preparedBy && ` · Questions: ${proposal.preparedBy.email}`}
        </span>
      </footer>
    </article>
  );
}

function Party({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-sm">
      <span className="eyebrow-style text-fg-tertiary mb-1">{label}</span>
      {children}
    </div>
  );
}

function PrintLine({
  line,
  pricing,
  currency,
}: {
  line: ProposalLine;
  pricing: LinePricing;
  currency: Currency;
}) {
  const { perSale } = pricing;
  const money = (amount: number) => <Amount value={{ amount, currency }} />;
  const itemised = line.presentation === "itemised";
  const parts: [string, number][] = itemised
    ? [
        ["Product value, refunded to the creator", perSale.orderValue],
        ...(perSale.bonus > 0
          ? ([["Creator bonus", perSale.bonus]] as [string, number][])
          : []),
        [
          "Hypedrive service fee",
          perSale.brandCharge - perSale.orderValue - perSale.bonus,
        ],
      ]
    : [];

  return (
    <div className="border-border flex break-inside-avoid flex-col gap-3 border-b py-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1fr)_6rem_8.5rem_8.5rem]">
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-medium">{line.product}</span>
          <span className="caption-style text-fg-tertiary">
            {MARKETPLACE_LABEL[line.marketplace]}
            <span className="sm:hidden">
              {" "}
              · {line.slots.toLocaleString("en-IN")} sales × {""}
              <Amount value={{ amount: perSale.brandCharge, currency }} />
            </span>
          </span>
        </span>
        <span className="text-right text-sm tabular-nums max-sm:hidden">
          {line.slots.toLocaleString("en-IN")}
        </span>
        <span className="text-right text-sm max-sm:hidden">
          {money(perSale.brandCharge)}
        </span>
        <span className="text-right text-sm font-medium">
          {money(pricing.total.brandCharge)}
        </span>
      </div>
      {itemised && (
        <div className="bg-overlay-1 flex flex-col gap-1.5 rounded-lg px-3 py-2.5 sm:max-w-md">
          {parts.map(([label, amount]) => (
            <div
              key={label}
              className="caption-style flex items-center justify-between gap-3"
            >
              <span className="text-fg-secondary">{label}</span>
              <span className="tabular-nums">{money(amount)}</span>
            </div>
          ))}
          <span className="caption-style text-fg-tertiary border-border mt-1 border-t pt-2 leading-snug">
            Creators receive their payout net of Hypedrive&apos;s commission of{" "}
            {bpsLabel(line.orderFeeBps)} on the order value
            {perSale.bonus > 0 &&
              ` and ${bpsLabel(line.bonusFeeBps)} on the bonus`}
            .
          </span>
        </div>
      )}
    </div>
  );
}

function listFormat(items: string[]) {
  return new Intl.ListFormat("en", { type: "conjunction" }).format(items);
}

function PaperSkeleton() {
  return (
    <div
      aria-busy
      className="bg-card shadow-overlay mx-auto flex max-w-[210mm] flex-col gap-8 rounded-xl px-6 py-8 sm:px-12 sm:py-12"
    >
      <div className="flex justify-between">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-14 w-32" />
      </div>
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
