import { addDays, istToday } from "./day";
import { PRIORITIES, type Priority } from "./enums";
import { cleanText, isValidDay } from "./normalize";

export const MAX_TASK_TITLE = 200;
export const MAX_TASK_LINES = 100;

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const BULLET = /^(?:[-*•]|\d+[.)])(?:\s+|$)/;
const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

export type TaskLine = {
  /** 1-based position in the pasted text. */
  line: number;
  title: string;
  priority: Priority | null;
  dueDate: string | null;
  error: string | null;
};

export type ParsedTaskLines = {
  tasks: TaskLine[];
  /** Non-blank lines beyond `MAX_TASK_LINES`, which are not parsed. */
  overflow: number;
};

function resolveDay(word: string, today: string) {
  if (word === "today") return today;
  if (word === "tomorrow") return addDays(today, 1);
  const weekday = WEEKDAYS.indexOf(word);
  if (weekday === -1) return null;
  const todayWeekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  return addDays(today, (weekday - todayWeekday + 7) % 7 || 7);
}

/**
 * One task per line: `Title !high @tomorrow`. Priority (`!urgent|!high|!normal|!low`)
 * and due date (`@today`, `@tomorrow`, `@mon`..`@sun` for the next such day,
 * `@YYYY-MM-DD`) are read from the end of the line; anything else stays in the title.
 */
export function parseTaskLines(
  text: string,
  today = istToday(),
): ParsedTaskLines {
  const tasks: TaskLine[] = [];
  let overflow = 0;

  text.split(/\r?\n/).forEach((raw, index) => {
    let rest = raw.trim().replace(BULLET, "").trim();
    if (!rest) return;
    if (tasks.length >= MAX_TASK_LINES) {
      overflow += 1;
      return;
    }

    let priority: Priority | null = null;
    let dueDate: string | null = null;
    let error: string | null = null;
    let sawDue = false;

    for (;;) {
      const match = /^(?:(.*\s))?(\S+)$/.exec(rest);
      if (!match) break;
      const word = match[2].toLowerCase();
      const head = (match[1] ?? "").trimEnd();
      if (word.startsWith("!") && !priority) {
        const value = PRIORITIES.find((item) => item === word.slice(1));
        if (!value) break;
        priority = value;
      } else if (word.startsWith("@") && !sawDue) {
        const name = word.slice(1);
        const day = resolveDay(name, today);
        if (day) dueDate = day;
        else if (DAY_SHAPE.test(name)) {
          if (isValidDay(name)) dueDate = name;
          else error = `${name} isn't a real date`;
        } else break;
        sawDue = true;
      } else break;
      rest = head;
    }

    const title = (cleanText(rest) ?? "").slice(0, MAX_TASK_TITLE).trim();
    if (!title && !error) error = "Add a title";
    tasks.push({ line: index + 1, title, priority, dueDate, error });
  });

  return { tasks, overflow };
}
