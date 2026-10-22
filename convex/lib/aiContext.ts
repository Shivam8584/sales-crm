import { addDays } from "../../lib/domain/day";
import { isValidDay } from "../../lib/domain/normalize";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MAX_AHEAD_DAYS = 730;

export function truncate(value: string | null | undefined, max: number) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** Drops rows about a person or lead whose data was erased; the one thing the model must never see. */
export function withoutErased<T extends { personId?: string; leadId?: string }>(
  rows: T[],
  erased: ReadonlySet<string>,
) {
  return rows.filter(
    (row) =>
      !(row.personId && erased.has(row.personId)) &&
      !(row.leadId && erased.has(row.leadId)),
  );
}

/** A model-written date, only if it is a real India day from today on and within two years. */
export function dayOrNull(value: string | null | undefined, today: string) {
  if (!value || !isValidDay(value)) return null;
  return value >= today && value <= addDays(today, MAX_AHEAD_DAYS)
    ? value
    : null;
}

export function todayLine(today: string) {
  const day = new Date(`${today}T00:00:00Z`).getUTCDay();
  return `${today} (${WEEKDAYS[day]})`;
}

const normal = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * The one candidate a spoken name refers to: a single exact match, else a
 * single partial match. Ambiguous or missing names are null, never guessed.
 */
export function pickByName<T>(
  candidates: T[],
  query: string,
  nameOf: (candidate: T) => string,
): T | null {
  const wanted = normal(query);
  if (!wanted) return null;
  const named = candidates
    .map((candidate) => ({ candidate, name: normal(nameOf(candidate)) }))
    .filter((item) => item.name);
  const exact = named.filter((item) => item.name === wanted);
  if (exact.length) return exact.length === 1 ? exact[0].candidate : null;
  const near = named.filter(
    (item) => item.name.includes(wanted) || wanted.includes(item.name),
  );
  return near.length === 1 ? near[0].candidate : null;
}

/** Quotes CRM data for the model; `<` is escaped so the text can't close the tag early. */
export function wrapData(value: unknown) {
  return `<data>\n${JSON.stringify(value).replace(/</g, "\\u003c")}\n</data>`;
}

export async function contextHash(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest).slice(0, 12), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
