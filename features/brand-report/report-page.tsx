"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import SegmentedControl from "@/components/_ui/segmented-control";
import SelectField from "@/components/_ui/select-field";
import Skeleton from "@/components/_ui/skeleton";
import MembershipGate from "@/features/auth/membership-gate";
import type { ReportKind } from "@/lib/domain/brand-report";
import { routes } from "@/lib/routes";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";
import BarChartIcon from "@/public/assets/icons/bar-chart-10.svg";
import EmailDialog from "./email-dialog";
import ReportDocument from "./report-document";

const PAGE_CSS = `@page { size: A4; margin: 14mm; }`;

const KINDS = [
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
];

/** The brand's results for a month or quarter, ready to print or save as PDF. */
export default function ReportPage(props: {
  id: Id<"accounts">;
  kind: ReportKind;
  periodKey?: string;
}) {
  return (
    <MembershipGate>
      <Report {...props} />
    </MembershipGate>
  );
}

function Report({
  id,
  kind,
  periodKey,
}: {
  id: Id<"accounts">;
  kind: ReportKind;
  periodKey?: string;
}) {
  const router = useRouter();
  const data = useQuery(api.brandReport.get, {
    accountId: id,
    kind,
    key: periodKey,
  });
  const [emailing, setEmailing] = useState(false);
  const go = (nextKind: string, key?: string) =>
    router.replace(routes.accountReport(id, nextKind, key));

  if (data === null) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <EmptyState
          icon={BarChartIcon}
          title="This account doesn't exist"
          action={
            <Button variant="secondary" size="sm" href={routes.accounts}>
              Back to accounts
            </Button>
          }
        />
      </main>
    );
  }

  return (
    <main className="bg-background min-h-dvh print:bg-transparent">
      <style>{PAGE_CSS}</style>
      <div className="border-border bg-background/90 z-sticky-header sticky top-0 border-b backdrop-blur print:hidden">
        <div className="mx-auto flex min-h-14 max-w-[210mm] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-control-lg"
            href={routes.account(id)}
            aria-label="Back to the account"
          >
            <ChevronDownIcon aria-hidden className="size-3 rotate-90" />
          </Button>
          <h1
            title={data && `Results report · ${data.account.name}`}
            className="min-w-40 flex-1 truncate text-base"
          >
            Results report
            {data && (
              <span className="text-fg-tertiary font-normal">
                {" "}
                · {data.account.name}
              </span>
            )}
          </h1>
          <SegmentedControl
            label="Report length"
            value={kind}
            segments={KINDS}
            onChange={(next) => go(next)}
          />
          <SelectField
            aria-label="Period"
            value={data?.period.key ?? ""}
            options={(data?.periods ?? []).map((item) => ({
              value: item.key,
              label: item.label,
            }))}
            disabled={!data}
            onChange={(key) => go(kind, key)}
            className="h-control-lg w-44"
          />
          <Button
            variant="secondary"
            size="toolbar"
            disabled={!data?.report}
            onClick={() => setEmailing(true)}
          >
            Email
          </Button>
          <Button
            variant="primary"
            size="toolbar"
            disabled={!data?.report}
            onClick={() => window.print()}
          >
            Print or save PDF
          </Button>
        </div>
      </div>
      <div className="px-3 py-6 sm:px-6 sm:py-10 print:p-0">
        {data === undefined ? (
          <PaperSkeleton />
        ) : data.report ? (
          <ReportDocument
            key={`${kind}-${data.period.key}`}
            accountId={id}
            kind={kind}
            data={{ ...data, report: data.report }}
          />
        ) : (
          <EmptyState
            icon={BarChartIcon}
            title="No platform data yet"
            description="This account isn't linked to a Hypedrive organisation, so there are no results to report."
            action={
              <Button variant="secondary" size="sm" href={routes.account(id)}>
                Back to the account
              </Button>
            }
          />
        )}
      </div>
      {emailing && (
        <EmailDialog
          accountId={id}
          monthKey={kind === "month" ? data?.period.key : undefined}
          onClose={() => setEmailing(false)}
        />
      )}
    </main>
  );
}

function PaperSkeleton() {
  return (
    <div
      aria-busy
      className="bg-well mx-auto flex max-w-[210mm] flex-col gap-8 rounded-3xl px-6 py-8 sm:px-12 sm:py-12"
    >
      <div className="flex justify-between">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-32" />
      </div>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
