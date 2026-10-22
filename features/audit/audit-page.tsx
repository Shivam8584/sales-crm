"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import { Input } from "@/components/_ui/input";
import SegmentedControl from "@/components/_ui/segmented-control";
import FilterMenu from "@/components/_common/filter-menu";
import { ExportButton } from "@/components/shell/page";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useUrlState } from "@/hooks/use-url-state";
import { useMembers, useViewer } from "@/hooks/use-viewer";
import { addDays, dayStart, istToday } from "@/lib/domain/day";
import { ROLE_RANK } from "@/lib/domain/enums";
import { readError } from "@/lib/errors";
import { downloadCsv } from "@/lib/csv";
import { routes } from "@/lib/routes";
import { toast } from "@/stores/toast-store";
import { ChangesList } from "./changes-list";
import { DeletedList } from "./deleted-list";

const SHOW = [
  { value: "changes", label: "Changes" },
  { value: "deleted", label: "Deleted" },
];
const ANY = "any";
const RECORDS = [
  { value: ANY, label: "All records" },
  { value: "accounts", label: "Accounts" },
  { value: "people", label: "People" },
  { value: "leads", label: "Leads" },
  { value: "deals", label: "Deals" },
  { value: "tasks", label: "Tasks" },
];
const DELETED_TYPES = RECORDS.filter(
  (item) => item.value !== ANY && item.value !== "leads",
);

export default function AuditPage() {
  const viewer = useViewer();
  if (ROLE_RANK[viewer.role] < ROLE_RANK.manager) {
    return (
      <EmptyState
        title="Only managers can see the audit log"
        description="Ask a manager or admin."
        action={
          <Button variant="secondary" size="sm" href={routes.profile}>
            Back to your profile
          </Button>
        }
      />
    );
  }
  return <AuditLog />;
}

function AuditLog() {
  const members = useMembers();
  const [show, setShow] = useUrlState("show", "changes");
  const [record, setRecord] = useUrlState("record", ANY);
  const [who, setWho] = useUrlState("who", ANY);
  const [from, setFrom] = useUrlState("from");
  const [to, setTo] = useUrlState("to");
  const [kind, setKind] = useUrlState("type", "accounts");
  const [exporting, setExporting] = useState(false);
  const exportRows = useAction(api.audit.exportCsv);

  const deleted = show === "deleted";
  const filters = {
    recordType:
      record === ANY
        ? undefined
        : (record as "accounts" | "people" | "leads" | "deals" | "tasks"),
    actorId: who === ANY ? undefined : (who as Id<"members">),
    from: from ? dayStart(from) : undefined,
    to: to ? dayStart(addDays(to, 1)) : undefined,
  };
  const filtered = record !== ANY || who !== ANY || Boolean(from || to);
  const clear = () => {
    setRecord(ANY);
    setWho(ANY);
    setFrom("");
    setTo("");
  };

  async function exportCsv() {
    setExporting(true);
    try {
      const { rows, truncated } = await exportRows(filters);
      downloadCsv(`audit-log-${istToday()}.csv`, rows);
      toast(
        truncated
          ? "Exported the newest 20,000 changes"
          : `Exported ${rows.length - 1} changes`,
      );
    } catch (error) {
      toast(readError(error, "Couldn't export the log").message, {
        tone: "danger",
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="border-border flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3">
        <SegmentedControl
          label="Show"
          value={deleted ? "deleted" : "changes"}
          onChange={setShow}
          segments={SHOW}
        />
        {deleted ? (
          <FilterMenu
            label="Type"
            value={kind}
            onChange={setKind}
            options={DELETED_TYPES}
          />
        ) : (
          <>
            <FilterMenu
              label="Record"
              value={record}
              onChange={setRecord}
              options={RECORDS}
            />
            <FilterMenu
              label="Who"
              value={who}
              onChange={setWho}
              options={[
                { value: ANY, label: "Anyone" },
                ...(members ?? []).map((member) => ({
                  value: member._id,
                  label: member.name,
                })),
              ]}
            />
            <Input
              type="date"
              aria-label="From date"
              value={from}
              max={to || undefined}
              onChange={(event) => setFrom(event.target.value)}
              className="h-control-md w-36"
            />
            <Input
              type="date"
              aria-label="To date"
              value={to}
              min={from || undefined}
              onChange={(event) => setTo(event.target.value)}
              className="h-control-md w-36"
            />
            {filtered && (
              <Button variant="ghost" size="xs" onClick={clear}>
                Clear
              </Button>
            )}
            <span className="ml-auto">
              <ExportButton onClick={exportCsv} disabled={exporting} />
            </span>
          </>
        )}
      </div>
      {deleted ? (
        <DeletedList type={kind} />
      ) : (
        <ChangesList filters={filters} filtered={filtered} onClear={clear} />
      )}
    </div>
  );
}
