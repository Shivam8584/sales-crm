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
import {
  BigNumber,
  DetailSection,
  MeterRow,
  StatTile,
} from "@/components/record/detail";
import { useDialer, type Dial } from "@/features/calls/use-dialer";
import type { TimelineTarget } from "@/features/timeline/kinds";
import { DEAL_STAGES, type DealStage } from "@/lib/domain/enums";
import { DEAL_STAGE_LABEL, personName } from "@/lib/domain/labels";
import { formatMoney } from "@/lib/domain/money";
import { formatPhone } from "@/lib/domain/normalize";
import { useUiStore } from "@/stores/ui-store";
import CalendarIcon from "@/public/assets/icons/calendar-sm.svg";
import MailIcon from "@/public/assets/icons/mail-04.svg";
import MailOpenIcon from "@/public/assets/icons/mail-03.svg";
import NoteIcon from "@/public/assets/icons/note.svg";
import PhoneCallIcon from "@/public/assets/icons/phone-call.svg";
import PhoneIcon from "@/public/assets/icons/phone.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import { MoneyValue, rankTotals } from "./record-cells";

type Account = NonNullable<FunctionReturnType<typeof api.accounts.get>>;
type Person = FunctionReturnType<typeof api.people.list>[number];
type Deal = FunctionReturnType<typeof api.deals.list>[number];

/** Detail sections in a record page sidebar sit flush with the column. */
export const ASIDE_SECTION = "-mb-2 px-0 pt-0 pb-5";

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

/** Owner with their email, then the primary contact with email and phone. */
export function AccountSummary({
  account,
  people,
  className,
  divider,
}: SectionProps & { account: Account; people: Person[] | undefined }) {
  const setPeek = useUiStore((state) => state.setPeek);
  const contact = primaryContact(people);
  return (
    <DetailSection
      title="Account summary"
      className={className}
      divider={divider}
    >
      <div className="flex flex-col gap-3">
        <div className="lead-style flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex min-w-0 items-center gap-1.5 font-medium">
            <Avatar name={account.owner?.name ?? "?"} />
            <span className="truncate">
              {account.owner?.name ?? "No owner"}
            </span>
            <span className="caption-style text-fg-tertiary font-normal">
              Owner
            </span>
          </span>
          <ContactLine email={account.owner?.email} />
        </div>
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
          <p className="caption-style text-fg-tertiary">
            No contact on this account yet.
          </p>
        )}
      </div>
    </DetailSection>
  );
}

const OPEN_STAGES = DEAL_STAGES.filter(
  (stage) => stage !== "won" && stage !== "lost",
);
const STAGE_METER_TONE: Record<
  (typeof OPEN_STAGES)[number],
  "danger" | "warning" | "success"
> = {
  discovery: "danger",
  demo: "warning",
  proposal: "warning",
  onboarding: "success",
};

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
    <DetailSection
      title="Pipeline health"
      className={className}
      divider={divider}
    >
      {deals === undefined ? (
        <div aria-busy className="flex flex-col gap-3">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
        </div>
      ) : !main ? (
        <div className="flex items-center justify-between gap-3">
          <p className="caption-style text-fg-secondary">
            No open deals
            {won > 0 && ` · ${won} won`}
          </p>
          <Button
            variant="secondary"
            size="xs"
            onClick={() => setCreate({ type: "deal", accountId })}
          >
            <PlusIcon aria-hidden className="size-2.5" />
            New deal
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <BigNumber
            value={<MoneyValue totals={totals} className="gap-1" />}
            caption={`Open pipeline across ${open!.length} ${open!.length === 1 ? "deal" : "deals"}${won ? ` · ${won} won` : ""}`}
          />
          <div className="flex flex-col gap-3">
            {OPEN_STAGES.map((stage) => {
              const amount = inMain
                .filter((deal) => deal.stage === stage)
                .reduce((sum, deal) => sum + deal.amount.amount, 0);
              const percent = main.amount ? (amount / main.amount) * 100 : 0;
              return (
                <MeterRow
                  key={stage}
                  label={DEAL_STAGE_LABEL[stage]}
                  percent={percent}
                  tone={STAGE_METER_TONE[stage]}
                  value={
                    amount > 0
                      ? `${formatMoney({ amount, currency: main.currency }, { compact: true })} · ${Math.round(percent)}%`
                      : "0%"
                  }
                />
              );
            })}
          </div>
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
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      ) : (
        <div className="@container flex flex-col gap-3">
          <BigNumber
            size="md"
            value={data.touches}
            trend={data.buckets}
            caption={
              data.touches === 0
                ? `No calls, emails, meetings or notes in the ${label.toLowerCase()}`
                : `${data.touches === 1 ? "Touch" : "Touches"} in the ${label.toLowerCase()}${data.bucketDays > 1 ? `, ${data.bucketDays} days per bar` : ""}`
            }
          />
          <div className="grid grid-cols-2 gap-2 @sm:grid-cols-4">
            <StatTile icon={MailOpenIcon} label="Emails" value={data.emails} />
            <StatTile
              icon={CalendarIcon}
              label="Meetings"
              value={data.meetings}
            />
            <StatTile icon={PhoneCallIcon} label="Calls" value={data.calls} />
            <StatTile icon={NoteIcon} label="Notes" value={data.notes} />
          </div>
        </div>
      )}
    </DetailSection>
  );
}
