"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Tag from "@/components/_ui/tag";
import Tooltip from "@/components/_ui/tooltip";
import { PageStatus } from "@/components/shell/page";
import {
  AUTOMATION_STATUS_LABEL,
  type AutomationStatus,
} from "@/lib/domain/automations";
import { STATUS_TONE } from "./node-meta";
import { routes } from "@/lib/routes";

export function StatusTag({ status }: { status: AutomationStatus }) {
  return (
    <Tag tone={STATUS_TONE[status]} size="xs">
      {AUTOMATION_STATUS_LABEL[status]}
    </Tag>
  );
}

/** Header pill while an admin has stopped every sequence; links to the switch. */
export function StoppedStatus() {
  const safety = useQuery(api.automations.safety, {});
  if (!safety?.killSwitch) return null;
  return (
    <Tooltip
      content={`${safety.killSwitch.by} stopped all sequences. Runs hold and nothing sends until it's turned off in Settings → Workspace.`}
    >
      <Link
        href={routes.workspace}
        className="focus-visible:ring-ring rounded-full outline-none focus-visible:ring-2"
      >
        <PageStatus tone="danger">All sequences stopped</PageStatus>
      </Link>
    </Tooltip>
  );
}
