"use client";

import { useState, type ReactNode } from "react";
import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import { Textarea } from "@/components/_ui/textarea";
import type { ReportKind } from "@/lib/domain/brand-report";
import { formatMoney } from "@/lib/domain/money";
import { readError } from "@/lib/errors";
import { shortDate } from "@/lib/time";
import { toast } from "@/stores/toast-store";
import Logo from "@/public/assets/images/_common/logo.svg";

type Data = NonNullable<FunctionReturnType<typeof api.brandReport.get>>;
type Loaded = Data & { report: NonNullable<Data["report"]> };

const inr = (paise: number) => formatMoney({ amount: paise, currency: "INR" });
const count = (value: number) => value.toLocaleString("en-IN");

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="caption-style text-fg-tertiary">{label}</dt>
      <dd className="text-2xl font-medium tabular-nums">{value}</dd>
      {note && (
        <dd className="caption-style text-fg-tertiary tabular-nums">{note}</dd>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex break-inside-avoid flex-col gap-3">
      <h2 className="text-fg-secondary text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}

/** The report as the brand reads it. Internal notes and CRM data never appear here. */
export default function ReportDocument({
  accountId,
  kind,
  data,
}: {
  accountId: Id<"accounts">;
  kind: ReportKind;
  data: Loaded;
}) {
  const { report } = data;
  const before = (value: number) =>
    value ? `${count(value)} the period before` : undefined;
  return (
    <article
      data-theme="light"
      aria-label={`${data.period.label} results for ${data.account.name}`}
      className="bg-card text-foreground mx-auto flex max-w-[210mm] flex-col gap-10 rounded-3xl px-6 py-8 [print-color-adjust:exact] sm:px-12 sm:py-12 print:max-w-none print:rounded-none print:bg-transparent print:p-0"
    >
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <Logo aria-hidden className="size-10 overflow-visible" />
          <span className="text-lg leading-none font-semibold tracking-[-0.01em]">
            Hypedrive
          </span>
        </div>
        <div className="flex flex-col gap-1 sm:text-right">
          <span className="text-lg font-medium">
            {kind === "quarter" ? "Quarterly review" : "Results report"}
          </span>
          <span className="text-fg-secondary text-sm">
            {data.account.name} · {data.period.label}
          </span>
          {report.ongoing && (
            <span className="caption-style text-fg-tertiary">
              In progress: numbers are still changing.
            </span>
          )}
        </div>
      </header>

      <dl className="border-border grid grid-cols-2 gap-x-6 gap-y-6 border-y py-6 sm:grid-cols-3">
        <Stat
          label="Added to wallet"
          value={inr(report.funding.addedPaise)}
          note={
            report.funding.previousPaise
              ? `${inr(report.funding.previousPaise)} the period before`
              : undefined
          }
        />
        <Stat
          label="Approved results"
          value={count(report.results.value)}
          note={before(report.results.previous)}
        />
        <Stat
          label={
            report.ongoing ? "Campaigns live now" : "Campaigns live at end"
          }
          value={count(report.campaigns.liveAtEnd)}
          note={
            report.campaigns.launched
              ? `${count(report.campaigns.launched)} launched`
              : undefined
          }
        />
      </dl>

      <Section title="Summary">
        <ul className="text-fg-secondary flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed">
          {data.highlights.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Section>

      {report.campaigns.rows.length > 0 && (
        <Section title="Campaigns">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="caption-style text-fg-tertiary">
                <th scope="col" className="py-2 pr-2 text-left font-normal">
                  Campaign
                </th>
                <th scope="col" className="px-2 py-2 text-left font-normal">
                  Status
                </th>
                <th scope="col" className="px-2 py-2 text-right font-normal">
                  Approved
                </th>
                <th scope="col" className="py-2 pl-2 text-right font-normal">
                  Slots filled (latest)
                </th>
              </tr>
            </thead>
            <tbody>
              {report.campaigns.rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-border break-inside-avoid border-t"
                >
                  <th
                    scope="row"
                    className="max-w-0 py-2.5 pr-2 text-left font-normal"
                  >
                    <span className="block truncate" title={row.title}>
                      {row.title}
                    </span>
                  </th>
                  <td className="px-2 py-2.5">{row.statusLabel}</td>
                  <td className="px-2 py-2.5 text-right">
                    {count(row.approved)}
                  </td>
                  <td className="py-2.5 pl-2 text-right">
                    {row.slots
                      ? `${count(row.slots.enrolled)}${row.slots.max ? ` of ${count(row.slots.max)}` : ""}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <Section title="Wallet and reviews">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <Stat
            label="Balance"
            value={
              report.wallet.balancePaise === null
                ? "—"
                : inr(report.wallet.balancePaise)
            }
            note={
              report.wallet.asOf
                ? `As of ${shortDate(report.wallet.asOf)}`
                : undefined
            }
          />
          <Stat
            label="Held for campaigns"
            value={
              report.wallet.heldPaise === null
                ? "—"
                : inr(report.wallet.heldPaise)
            }
          />
          <Stat
            label="Waiting for review"
            value={count(report.reviews.waiting)}
            note={
              report.reviews.oldestDays
                ? `Oldest ${count(report.reviews.oldestDays)} days`
                : undefined
            }
          />
          <Stat label="Disputes" value={count(report.reviews.disputes)} />
        </dl>
      </Section>

      {report.milestones.length > 0 && (
        <Section title="Milestones">
          <ul className="flex flex-col gap-1.5 text-sm">
            {report.milestones.map((item) => (
              <li
                key={item.stage}
                className="flex items-baseline justify-between gap-4"
              >
                <span
                  className={item.inPeriod ? undefined : "text-fg-secondary"}
                >
                  {item.label}
                </span>
                <span className="text-fg-tertiary tabular-nums">
                  {shortDate(item.at)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {kind === "quarter" && (
        <TalkingPoints
          accountId={accountId}
          periodKey={data.period.key}
          initial={data.talkingPoints}
        />
      )}

      <footer className="caption-style text-fg-tertiary border-border flex flex-wrap justify-between gap-2 border-t pt-5">
        <span>Hypedrive · hypedrive.in</span>
        <span>Figures are from the Hypedrive platform, in INR.</span>
      </footer>
    </article>
  );
}

function TalkingPoints({
  accountId,
  periodKey,
  initial,
}: {
  accountId: Id<"accounts">;
  periodKey: string;
  initial: string[];
}) {
  const aiOn = useQuery(api.ai.enabled, {});
  const draft = useAction(api.brandReport.draftPoints);
  const [text, setText] = useState(initial.join("\n"));
  const [busy, setBusy] = useState(false);
  const lines = text.split("\n").filter((line) => line.trim());

  async function write() {
    setBusy(true);
    try {
      setText((await draft({ accountId, key: periodKey })).join("\n"));
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Talking points">
      <div className="flex flex-col gap-2 print:hidden">
        <Textarea
          aria-label="Talking points, one per line"
          value={text}
          rows={6}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="flex items-center gap-3">
          <span className="caption-style text-fg-tertiary flex-1">
            One per line. Edit before you print.
          </span>
          {aiOn && (
            <Button size="sm" loading={busy} onClick={() => void write()}>
              Draft with AI
            </Button>
          )}
        </div>
      </div>
      <ul className="text-fg-secondary hidden list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed print:flex">
        {lines.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
    </Section>
  );
}
