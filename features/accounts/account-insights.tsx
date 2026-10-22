"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import Skeleton from "@/components/_ui/skeleton";
import FilterMenu from "@/components/_common/filter-menu";
import Sparkline from "@/components/_common/sparkline";
import { DetailSection } from "@/components/record/detail";
import { useDialer, type Dial } from "@/features/calls/use-dialer";
import type { TimelineTarget } from "@/features/timeline/kinds";
import { DEAL_STAGES, type DealStage } from "@/lib/domain/enums";
import { DEAL_STAGE_LABEL, personName } from "@/lib/domain/labels";
import { formatMoney } from "@/lib/domain/money";
import { formatPhone } from "@/lib/domain/normalize";
import { useUiStore } from "@/stores/ui-store";
import MailIcon from "@/public/assets/icons/mail-03.svg";
import PhoneIcon from "@/public/assets/icons/phone.svg";
import { MoneyValue, rankTotals } from "./record-cells";

type Person = FunctionReturnType<typeof api.people.list>[number];
type Deal = FunctionReturnType<typeof api.deals.list>[number];

/** Detail sections in a record page sidebar sit flush with the column. */
export const ASIDE_SECTION = "-mb-2 px-0 pt-0 pb-5";

/** The one well in a record sidebar. */
export const WELL_SECTION = "bg-well relative overflow-hidden rounded-3xl p-6";

type SectionProps = { className?: string; divider?: boolean };

function PhoneLink({ call }: { call: Dial }) {
  const { dial, dialog } = useDialer();
  return (
    <>
      <button
        type="button"
        onClick={() => dial(call)}
        className="hover:text-foreground text-fg-secondary focus-visible:ring-ring flex shrink-0 items-center gap-1 rounded-sm tabular-nums outline-none focus-visible:ring-2"
      >
        <PhoneIcon aria-hidden className="size-3 shrink-0" />
        {formatPhone(call.phone)}
      </button>
      {dialog}
    </>
  );
}

function ContactLine({ email, call }: { email?: string | null; call?: Dial }) {
  return (
    <>
      {email && (
        <a
          href={`mailto:${email}`}
          className="hover:text-foreground text-fg-secondary focus-visible:ring-ring flex min-w-0 items-center gap-1 rounded-sm outline-none focus-visible:ring-2"
        >
          <MailIcon aria-hidden className="size-3 shrink-0" />
          <span className="truncate">{email}</span>
        </a>
      )}
      {call && <PhoneLink call={call} />}
    </>
  );
}

/** The person on the account the team talks to most recently. */
function primaryContact(people: Person[] | undefined) {
  return [...(people ?? [])].sort(
    (a, b) =>
      (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0) ||
      a._creationTime - b._creationTime,
  )[0];
}

/** The primary contact with email and phone. */
export function AccountSummary({
  people,
  className,
  divider,
}: SectionProps & { people: Person[] | undefined }) {
  const setPeek = useUiStore((state) => state.setPeek);
  const contact = primaryContact(people);
  return (
    <DetailSection title="Contact" className={className} divider={divider}>
      {people === undefined ? (
        <Skeleton className="h-4 w-56" />
      ) : contact ? (
        <div className="lead-style flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={() => setPeek({ type: "person", id: contact._id })}
            className="hover:bg-overlay-2 focus-visible:ring-ring -mx-1.5 -my-1 flex min-w-0 items-center gap-1.5 rounded-full px-1.5 py-1 font-medium outline-none focus-visible:ring-2"
          >
            <Avatar name={personName(contact)} />
            <span className="truncate">{personName(contact)}</span>
            <span className="caption-style text-fg-tertiary font-normal">
              {contact.title ?? "Contact"}
            </span>
          </button>
          <ContactLine
            email={contact.email}
            call={
              contact.phone
                ? {
                    target: { personId: contact._id },
                    name: personName(contact),
                    phone: contact.phone,
                  }
                : undefined
            }
          />
        </div>
      ) : (
        <p className="caption-style text-fg-tertiary">No contact yet</p>
      )}
    </DetailSection>
  );
}

const OPEN_STAGES = DEAL_STAGES.filter(
  (stage) => stage !== "won" && stage !== "lost",
);

/** Open pipeline in the account's main currency, split by deal stage. */
export function PipelineHealth({
  accountId,
  deals,
  className,
  divider,
}: SectionProps & { accountId: Id<"accounts">; deals: Deal[] | undefined }) {
  const setCreate = useUiStore((state) => state.setCreate);
  const open = deals?.filter((deal) =>
    (OPEN_STAGES as readonly DealStage[]).includes(deal.stage),
  );
  const totals = rankTotals(open?.map((deal) => deal.amount) ?? []);
  const main = totals[0];
  const inMain =
    open?.filter((deal) => deal.amount.currency === main?.currency) ?? [];
  const won = deals?.filter((deal) => deal.stage === "won").length ?? 0;

  return (
    <DetailSection title="Pipeline" className={className} divider={divider}>
      {deals === undefined ? (
        <div aria-busy className="flex flex-col gap-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3 w-full" />
        </div>
      ) : !main ? (
        <div className="flex items-center justify-between gap-3">
          <p className="caption-style text-fg-secondary">
            No open deals
            {won > 0 && ` · ${won} won`}
          </p>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setCreate({ type: "deal", accountId })}
          >
            New deal
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <MoneyValue
              totals={totals}
              className="text-4xl leading-none font-semibold tracking-[-0.035em]"
            />
            <p className="text-fg-secondary text-sm">
              {open!.length} open {open!.length === 1 ? "deal" : "deals"}
              {won > 0 && ` · ${won} won`}
            </p>
          </div>
          <dl className="border-border mt-2 flex flex-col gap-3 border-t pt-4">
            {OPEN_STAGES.map((stage) => {
              const amount = inMain
                .filter((deal) => deal.stage === stage)
                .reduce((sum, deal) => sum + deal.amount.amount, 0);
              if (amount === 0) return null;
              const share = Math.round((amount / main.amount) * 100);
              return (
                <div
                  key={stage}
                  className="flex flex-col gap-1.5 text-sm tabular-nums"
                >
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-fg-secondary">
                      {DEAL_STAGE_LABEL[stage]}
                    </dt>
                    <dd className="font-medium">
                      {formatMoney(
                        { amount, currency: main.currency },
                        { compact: true },
                      )}
                    </dd>
                  </div>
                  <span aria-hidden className="bg-track block h-1 rounded-full">
                    <span
                      className="bg-foreground block h-full rounded-full"
                      style={{ width: `${share}%` }}
                    />
                  </span>
                </div>
              );
            })}
          </dl>
        </div>
      )}
    </DetailSection>
  );
}

const WINDOWS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

/** Touches logged on the record over a window: total, trend and per kind. */
export function ActivityTrend({
  target,
  className,
  divider,
}: SectionProps & { target: TimelineTarget }) {
  const [range, setRange] = useState("30");
  const days = Number(range) as 7 | 30 | 90;
  const data = useQuery(api.timeline.activity, { target, days });
  const label = WINDOWS.find((item) => item.value === range)!.label;
  const kinds = data
    ? [
        ["email", "emails", data.emails],
        ["meeting", "meetings", data.meetings],
        ["call", "calls", data.calls],
        ["note", "notes", data.notes],
      ].filter(([, , count]) => count !== 0)
    : [];

  return (
    <DetailSection
      title="Activity trend"
      className={className}
      divider={divider}
      action={
        <FilterMenu
          value={range}
          options={WINDOWS}
          onChange={setRange}
          align="end"
        />
      }
    >
      {data === undefined ? (
        <div aria-busy className="flex flex-col gap-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-end justify-between gap-3">
            <span className="text-sm font-medium tabular-nums">
              {data.touches}
            </span>
            {data.touches > 0 && (
              <Sparkline values={data.buckets} className="h-5.5" />
            )}
          </div>
          <p className="caption-style text-fg-secondary tabular-nums">
            {data.touches === 0
              ? `Nothing logged in the ${label.toLowerCase()}`
              : kinds
                  .map(
                    ([one, many, count]) =>
                      `${count} ${count === 1 ? one : many}`,
                  )
                  .join(" · ")}
          </p>
        </div>
      )}
    </DetailSection>
  );
}
