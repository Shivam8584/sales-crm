import type { TagTone } from "@/data/companies";

export const DEAL_STAGES = [
  { id: "discovery", name: "Discovery", tone: "blue" },
  { id: "evaluation", name: "Evaluation", tone: "purple" },
  { id: "proposal", name: "Proposal", tone: "amber" },
  { id: "negotiation", name: "Negotiation", tone: "orange" },
  { id: "won", name: "Won", tone: "green" },
  { id: "lost", name: "Lost", tone: "neutral" },
] as const satisfies readonly { id: string; name: string; tone: TagTone }[];

export type DealStage = (typeof DEAL_STAGES)[number]["id"];

export const OPEN_STAGES: readonly DealStage[] = [
  "discovery",
  "evaluation",
  "proposal",
  "negotiation",
];

export type Deal = {
  id: string;
  title: string;
  companyId: string;
  stage: DealStage;
  value: number;
  owner: string;
  closeDate: string | null;
  rank: number;
  createdAt: string;
};

export const TASK_STATUSES = [
  { id: "todo", name: "To do", tone: "neutral" },
  { id: "in-progress", name: "In progress", tone: "blue" },
  { id: "done", name: "Done", tone: "green" },
] as const satisfies readonly { id: string; name: string; tone: TagTone }[];

export type TaskStatus = (typeof TASK_STATUSES)[number]["id"];

export const PRIORITIES = [
  { id: "urgent", name: "Urgent", tone: "red" },
  { id: "normal", name: "Normal", tone: "blue" },
  { id: "low", name: "Low", tone: "neutral" },
] as const satisfies readonly { id: string; name: string; tone: TagTone }[];

export type Priority = (typeof PRIORITIES)[number]["id"];

export type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assignee: string;
  companyId: string | null;
  dueDate: string | null;
  rank: number;
  createdAt: string;
};

export function stageMeta(id: string) {
  return DEAL_STAGES.find((stage) => stage.id === id) ?? DEAL_STAGES[0];
}

export function statusMeta(id: string) {
  return TASK_STATUSES.find((status) => status.id === id) ?? TASK_STATUSES[0];
}

export function priorityMeta(id: string) {
  return PRIORITIES.find((priority) => priority.id === id) ?? PRIORITIES[1];
}

/** Rank that sorts an item just before `beforeId` (or last) within `column`. */
export function rankBefore<T extends { id: string; rank: number }>(
  column: T[],
  movingId: string,
  beforeId: string | null,
) {
  const others = column
    .filter((item) => item.id !== movingId)
    .sort((a, b) => a.rank - b.rank);
  const index = beforeId
    ? others.findIndex((item) => item.id === beforeId)
    : -1;
  if (index === -1) {
    const last = others.at(-1);
    return last ? last.rank + 1 : 1;
  }
  const next = others[index].rank;
  const prev = index > 0 ? others[index - 1].rank : next - 2;
  return (prev + next) / 2;
}

export function todayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function isOverdue(date: string | null, done: boolean) {
  return date !== null && !done && date < todayKey();
}

const SHORT_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

export function formatDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return SHORT_DATE.format(new Date(year, month - 1, day));
}

export function formatCompactMoney(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}
