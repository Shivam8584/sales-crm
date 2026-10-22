"use client";

import Link from "next/link";
import Avatar from "@/components/_ui/avatar";
import Tooltip from "@/components/_ui/tooltip";
import { MoneyValue } from "@/features/accounts/record-cells";
import { formatMoney, type Money } from "@/lib/domain/money";
import { ORG_ROLE_TITLE } from "@/lib/domain/platform";
import { shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import { Muted, Section, When, type Linked } from "./platform-shared";

const WEEK_LABEL = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
});

export function Deposits({ deposits }: { deposits: Linked["deposits"] }) {
  const peak = Math.max(...deposits.weeks.map((week) => week.amount.amount));
  const stats: { label: string; value: Money; caption: string }[] = [
    {
      label: "Last 30 days",
      value: deposits.last30,
      caption: "Top-ups and transfers",
    },
    {
      label: "Last 90 days",
      value: deposits.last90,
      caption: `${deposits.count90} ${deposits.count90 === 1 ? "deposit" : "deposits"}`,
    },
    {
      label: "All time",
      value: deposits.lifetime,
      caption: `${deposits.lifetimeCount} ${deposits.lifetimeCount === 1 ? "deposit" : "deposits"}`,
    },
  ];
  const first = deposits.weeks[0];
  const middle = deposits.weeks[Math.floor(deposits.weeks.length / 2)];
  return (
    <Section title="Deposits">
      <div className="grid gap-6 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] md:gap-8">
        <dl className="grid grid-cols-3 gap-4 md:grid-cols-1 md:gap-5">
          {stats.map((stat) => (
            <div key={stat.label} className="flex min-w-0 flex-col gap-2">
              <dt className="caption-style text-fg-tertiary truncate">
                {stat.label}
              </dt>
              <dd className="flex min-w-0 flex-col gap-1.5">
                <span className="font-display text-lg leading-none font-medium">
                  <MoneyValue totals={[stat.value]} />
                </span>
                <span className="caption-style text-fg-tertiary truncate">
                  {stat.caption}
                </span>
              </dd>
            </div>
          ))}
        </dl>
        <figure className="flex min-w-0 flex-col gap-2">
          <figcaption className="caption-style text-fg-tertiary flex items-center justify-between gap-2">
            <span>Weekly, last 12 weeks</span>
            {peak > 0 && (
              <span className="tabular-nums">
                Peak{" "}
                {formatMoney(
                  { amount: peak, currency: "INR" },
                  { compact: true },
                )}
              </span>
            )}
          </figcaption>
          <div
            role="list"
            aria-label="Deposits per week"
            className="border-border flex h-32 items-end gap-1 border-b pb-px sm:gap-1.5"
          >
            {deposits.weeks.map((week) => {
              const height = peak ? (week.amount.amount / peak) * 100 : 0;
              const label = `Week of ${WEEK_LABEL.format(week.start)}: ${
                week.count
                  ? `${formatMoney(week.amount)} in ${week.count} ${week.count === 1 ? "deposit" : "deposits"}`
                  : "no deposits"
              }`;
              return (
                <Tooltip key={week.start} content={label}>
                  <span
                    role="listitem"
                    tabIndex={0}
                    aria-label={label}
                    className="group/bar focus-visible:ring-ring flex h-full min-w-0 flex-1 items-end rounded-xs outline-none focus-visible:ring-2"
                  >
                    <span
                      className={cn(
                        "duration-fast w-full rounded-t-[3px] transition-colors",
                        week.count
                          ? "bg-success/80 group-hover/bar:bg-success"
                          : "bg-overlay-3",
                      )}
                      style={{
                        height: week.count ? `max(${height}%, 4px)` : "2px",
                      }}
                    />
                  </span>
                </Tooltip>
              );
            })}
          </div>
          <div className="caption-style text-fg-tertiary flex justify-between tabular-nums">
            <span>{WEEK_LABEL.format(first.start)}</span>
            <span>{WEEK_LABEL.format(middle.start)}</span>
            <span>This week</span>
          </div>
        </figure>
      </div>
    </Section>
  );
}

export function Listings({ listings }: { listings: Linked["listings"] }) {
  const total = listings.reduce((sum, item) => sum + item.count, 0);
  return (
    <Section
      title="Listings"
      count={total}
      meta={
        listings.length > 0 &&
        `${listings.length} ${listings.length === 1 ? "marketplace" : "marketplaces"}`
      }
    >
      {listings.length === 0 ? (
        <Muted>No products listed on Hypedrive yet.</Muted>
      ) : (
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {listings.map((market) => (
            <li key={market.slug}>
              <Tooltip
                content={`${market.count} ${market.count === 1 ? "listing" : "listings"} · first ${shortDate(market.firstAt)}, latest ${shortDate(market.latestAt)}`}
              >
                <span
                  tabIndex={0}
                  className="focus-visible:ring-ring flex items-baseline gap-1.5 rounded-sm outline-none focus-visible:ring-2"
                >
                  {market.label}
                  <span className="text-fg-tertiary tabular-nums">
                    {market.count}
                  </span>
                  {market.newMarketplace && (
                    <span className="text-success caption-style">New</span>
                  )}
                </span>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function Team({ members }: { members: Linked["members"] }) {
  return (
    <Section title="Platform team" count={members.length}>
      {members.length === 0 ? (
        <Muted>Their Hypedrive team appears here after the first sync.</Muted>
      ) : (
        <ul className="divide-border flex flex-col divide-y">
          {members.map((member) => {
            const name =
              member.person?.name ?? member.name ?? member.email ?? "Unnamed";
            const role = ORG_ROLE_TITLE[member.role] ?? member.role;
            return (
              <li
                key={member.userId}
                className="flex min-h-13 items-center gap-3 py-2"
              >
                <Avatar name={name} size="md" />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  {member.person ? (
                    <Link
                      href={routes.person(member.person._id)}
                      className="lead-style focus-visible:ring-ring truncate rounded-sm font-medium outline-none hover:underline focus-visible:ring-2"
                    >
                      {name}
                    </Link>
                  ) : (
                    <span className="lead-style truncate font-medium">
                      {name}
                    </span>
                  )}
                  <span
                    className="caption-style text-fg-tertiary truncate"
                    title={member.email ?? undefined}
                  >
                    {[
                      member.email,
                      !member.person && "Not in the CRM",
                      member.person &&
                        !member.person.onAccount &&
                        "On another account",
                      member.joinedAt && `joined ${shortDate(member.joinedAt)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span
                  className="caption-style text-fg-tertiary shrink-0"
                  title={
                    member.roles.length > 1
                      ? member.roles
                          .map(
                            (item) =>
                              ORG_ROLE_TITLE[
                                item as keyof typeof ORG_ROLE_TITLE
                              ] ?? item,
                          )
                          .join(", ")
                      : undefined
                  }
                >
                  {role}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

const EVENT_DOT = {
  good: "bg-success",
  warn: "bg-warning",
  bad: "bg-danger",
  neutral: "bg-fg-tertiary",
} as const;

export function Events({ events }: { events: Linked["events"] }) {
  return (
    <Section
      title="Recent platform events"
      meta={events.length > 0 && `Latest ${events.length}`}
    >
      {events.length === 0 ? (
        <Muted>
          Nothing reported yet. Sign-ups, top-ups and campaign changes appear
          here as the platform sends them.
        </Muted>
      ) : (
        <ol className="flex flex-col">
          {events.map((event) => (
            <li key={event._id} className="flex gap-3">
              <span
                aria-hidden
                className={cn(
                  "mt-[0.4rem] size-1.5 shrink-0 rounded-full",
                  EVENT_DOT[event.tone],
                )}
              />
              <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pb-3">
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-sm">{event.title}</span>
                  {event.detail && (
                    <span
                      className="caption-style text-fg-tertiary truncate leading-snug"
                      title={event.detail}
                    >
                      {event.detail}
                    </span>
                  )}
                </span>
                <When
                  at={event.occurredAt}
                  className="caption-style text-fg-tertiary shrink-0"
                />
              </span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
