import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { TagTone } from "@/components/_ui/tag";
import type { Priority, TaskStatus } from "@/lib/domain/enums";
import { cn } from "@/lib/utils";

export type TaskRow = FunctionReturnType<typeof api.tasks.list>[number];

export const STATUS_TONE: Record<TaskStatus, TagTone> = {
  todo: "neutral",
  in_progress: "amber",
  done: "green",
};

const TONE_TEXT: Record<TagTone, string> = {
  blue: "text-(--tag-blue-text)",
  purple: "text-(--tag-purple-text)",
  green: "text-(--tag-green-text)",
  moss: "text-(--tag-moss-text)",
  red: "text-(--tag-red-text)",
  orange: "text-(--tag-orange-text)",
  amber: "text-(--tag-amber-text)",
  teal: "text-(--tag-teal-text)",
  yellow: "text-(--tag-yellow-text)",
  neutral: "text-fg-tertiary",
};

export function StatusIcon({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 14 14"
      fill="none"
      className={cn(
        "size-3.5 shrink-0",
        TONE_TEXT[STATUS_TONE[status]],
        className,
      )}
    >
      {status === "todo" && (
        <circle
          cx="7"
          cy="7"
          r="5.6"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeDasharray="2.2 1.8"
        />
      )}
      {status === "in_progress" && (
        <>
          <circle
            cx="7"
            cy="7"
            r="5.6"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path d="M7 3.5a3.5 3.5 0 0 1 0 7z" fill="currentColor" />
        </>
      )}
      {status === "done" && (
        <>
          <circle cx="7" cy="7" r="6.3" fill="currentColor" />
          <path
            d="M4.4 7.2 6.2 9l3.4-3.6"
            className="stroke-background"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}

const PRIORITY_BARS: Record<Priority, number> = {
  urgent: 3,
  high: 3,
  normal: 2,
  low: 1,
};

export const PRIORITY_TEXT: Record<Priority, string> = {
  urgent: TONE_TEXT.red,
  high: TONE_TEXT.orange,
  normal: "text-fg-secondary",
  low: "text-fg-tertiary",
};

export function PriorityIcon({
  priority,
  className,
}: {
  priority: Priority;
  className?: string;
}) {
  if (priority === "urgent") {
    return (
      <svg
        aria-hidden
        viewBox="0 0 14 14"
        className={cn("size-3.5 shrink-0", PRIORITY_TEXT.urgent, className)}
      >
        <rect x="1" y="1" width="12" height="12" rx="3" fill="currentColor" />
        <path
          d="M7 3.8v3.7"
          className="stroke-background"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="7" cy="9.9" r="0.95" className="fill-background" />
      </svg>
    );
  }
  const filled = PRIORITY_BARS[priority];
  return (
    <svg
      aria-hidden
      viewBox="0 0 14 14"
      className={cn("size-3.5 shrink-0", PRIORITY_TEXT[priority], className)}
    >
      {[0, 1, 2].map((bar) => (
        <rect
          key={bar}
          x={1.5 + bar * 4}
          y={8 - bar * 3}
          width="3"
          height={4.5 + bar * 3}
          rx="1"
          fill="currentColor"
          opacity={bar < filled ? 1 : 0.25}
        />
      ))}
    </svg>
  );
}

/** Local calendar day `days` from today, as `YYYY-MM-DD`. */
export function dayFromToday(days = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const WEEKDAY = new Intl.DateTimeFormat("en-IN", { weekday: "short" });
const DAY_MONTH = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
});
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function parseDay(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

/** "Today", "Tomorrow", "Fri" within the week, otherwise "24 Oct". */
export function formatDay(day: string) {
  if (day === dayFromToday(0)) return "Today";
  if (day === dayFromToday(1)) return "Tomorrow";
  if (day === dayFromToday(-1)) return "Yesterday";
  const date = parseDay(day);
  if (day > dayFromToday(1) && day <= dayFromToday(6)) {
    return WEEKDAY.format(date);
  }
  return date.getFullYear() === new Date().getFullYear()
    ? DAY_MONTH.format(date)
    : DAY_MONTH_YEAR.format(date);
}

/** Always the date itself, e.g. "24 Oct". */
export function shortDay(day: string) {
  return DAY_MONTH.format(parseDay(day));
}

export function isOverdue(task: Pick<TaskRow, "dueDate" | "status">) {
  return (
    task.status !== "done" &&
    task.dueDate !== null &&
    task.dueDate < dayFromToday(0)
  );
}

export const QUICK_DATES = [
  { label: "Today", days: 0 },
  { label: "Tomorrow", days: 1 },
  { label: "Next week", days: 7 },
] as const;
