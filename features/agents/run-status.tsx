import { StatusText } from "@/features/settings/settings-ui";
import type { AgentRunStatus } from "@/lib/domain/agents";

const STATUS = {
  queued: { label: "Queued", tone: "muted" },
  running: { label: "Running", tone: "neutral" },
  done: { label: "Done", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
  capped: { label: "Hit a limit", tone: "warning" },
  skipped: { label: "Skipped", tone: "muted" },
} as const;

export default function RunStatus({ status }: { status: AgentRunStatus }) {
  const { label, tone } = STATUS[status];
  return <StatusText tone={tone}>{label}</StatusText>;
}
