"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import EmptyState from "@/components/_ui/empty-state";
import Tag from "@/components/_ui/tag";
import DataTable from "@/components/data-table/data-table";
import type { Column, SortState } from "@/components/data-table/types";
import {
  ENROLLMENT_STATUS_LABEL,
  SUBJECT_LABEL,
  isLive,
  type Graph,
  type NameLookup,
  type SubjectKind,
  type Trigger,
} from "@/lib/domain/automations";
import { readError } from "@/lib/errors";
import { dateTime, relativeTime } from "@/lib/time";
import { toast } from "@/stores/toast-store";
import AutomationIcon from "@/public/assets/icons/automation.svg";
import LogOutIcon from "@/public/assets/icons/log-out.svg";
import { describeStep } from "./describe";
import { ENROLLMENT_TONE } from "./node-meta";

type Run = FunctionReturnType<typeof api.automations.enrollments>[number];

function When({ at }: { at: number | null }) {
  if (!at) return <span className="text-fg-tertiary">—</span>;
  return (
    <time
      dateTime={new Date(at).toISOString()}
      title={dateTime(at)}
      className="tabular-nums"
    >
      {relativeTime(at)}
    </time>
  );
}

export function RunStatus({
  status,
  held,
}: {
  status: Run["status"];
  held: boolean;
}) {
  return (
    <Tag tone={held ? "neutral" : ENROLLMENT_TONE[status]} size="xs">
      {held ? "Held (paused)" : ENROLLMENT_STATUS_LABEL[status]}
    </Tag>
  );
}

/** Every record that went through the automation, newest first. */
export default function AutomationRuns({
  id,
  graph,
  trigger,
  subjectKind,
  names,
}: {
  id: Id<"automations">;
  graph: Graph;
  trigger: Trigger;
  subjectKind: SubjectKind;
  names: NameLookup;
}) {
  const runs = useQuery(api.automations.enrollments, { id });
  const exit = useMutation(api.automations.exitEnrollment);
  const [sort, setSort] = useState<SortState>({ id: "enrolled", dir: "desc" });

  const stepOf = (run: Run) => {
    const node = graph.nodes.find((item) => item.id === run.currentNodeId);
    return node ? describeStep(node, trigger, subjectKind, names).title : null;
  };

  async function remove(run: Run) {
    try {
      await exit({ id: run._id });
      toast(`Removed ${run.subject.name} from the automation`);
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  const columns: Column<Run>[] = [
    {
      id: "record",
      header: SUBJECT_LABEL[subjectKind][0].replace(/^./, (c) =>
        c.toUpperCase(),
      ),
      width: "minmax(10rem,1.2fr)",
      sortValue: (run) => run.subject.name,
      cell: (run) => (
        <span className="truncate" title={run.subject.name}>
          {run.subject.name}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      width: "8rem",
      sortValue: (run) => run.status,
      cell: (run) => <RunStatus status={run.status} held={run.held} />,
    },
    {
      id: "step",
      header: "Step",
      width: "minmax(10rem,1.4fr)",
      minViewport: 800,
      cell: (run) => {
        const text = isLive(run.status) ? stepOf(run) : run.exitReason;
        return text ? (
          <span className="text-fg-secondary truncate" title={text}>
            {text}
          </span>
        ) : (
          <span className="text-fg-tertiary">—</span>
        );
      },
    },
    {
      id: "next",
      header: "Next / ended",
      width: "8rem",
      minViewport: 1000,
      sortValue: (run) => run.nextRunAt ?? run.finishedAt,
      cell: (run) => (
        <When at={isLive(run.status) ? run.nextRunAt : run.finishedAt} />
      ),
    },
    {
      id: "enrolled",
      header: "Enrolled",
      width: "8rem",
      align: "end",
      defaultDir: "desc",
      sortValue: (run) => run.enrolledAt,
      cell: (run) => <When at={run.enrolledAt} />,
    },
  ];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <DataTable
        label="Runs"
        columns={columns}
        rows={runs}
        getId={(run) => run._id}
        getHref={(run) => run.subject.href ?? "#"}
        getLabel={(run) => run.subject.name}
        sort={sort}
        onSortChange={setSort}
        keyboard={false}
        rowMenu={(run) => [
          isLive(run.status) && {
            label: "Remove from automation",
            icon: LogOutIcon,
            onSelect: () => void remove(run),
          },
        ]}
        renderCard={(run) => (
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">
                {run.subject.name}
              </span>
              <RunStatus status={run.status} held={run.held} />
            </div>
            <span className="caption-style text-fg-tertiary truncate">
              {(isLive(run.status) ? stepOf(run) : run.exitReason) ?? "—"} ·
              enrolled {relativeTime(run.enrolledAt)}
            </span>
          </div>
        )}
        empty={
          <EmptyState
            icon={AutomationIcon}
            title="No runs yet"
            description={`Once the automation is active, every ${SUBJECT_LABEL[subjectKind][0]} it enrols shows up here with the step it's on.`}
          />
        }
      />
    </div>
  );
}
