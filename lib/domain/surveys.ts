export const SURVEY_TTL_DAYS = 30;
export const SURVEY_DAY_MS = 86_400_000;
/** After answering, the respondent can still change the comment for this long. */
export const COMMENT_EDIT_MS = 10 * 60_000;
export const COMMENT_MAX = 1000;
export const NPS_MIN_RESPONSES = 5;

export type ScoreBucket = "promoter" | "passive" | "detractor";

export const isScore = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= 10;

export function scoreBucket(score: number): ScoreBucket {
  if (score >= 9) return "promoter";
  return score >= 7 ? "passive" : "detractor";
}

/** Percent promoters minus percent detractors, rounded; null when nobody answered. */
export function npsOf(scores: readonly number[]) {
  const counts = { promoter: 0, passive: 0, detractor: 0 };
  for (const score of scores) counts[scoreBucket(score)]++;
  const total = scores.length;
  return {
    total,
    ...counts,
    nps: total
      ? Math.round(((counts.promoter - counts.detractor) / total) * 100)
      : null,
  };
}

/** 32 random bytes as 43 base64url characters. */
export function newSurveyToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const isSurveyToken = (value: unknown): value is string =>
  typeof value === "string" && TOKEN.test(value);

/** Strips control characters (keeping line breaks) and surrounding space; undefined when nothing is left. */
export function cleanComment(value: string) {
  const text = value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u2028\u2029]/g, "")
    .trim();
  return text || undefined;
}

export const surveyPath = (token: string) => `/survey/${token}`;

/** The task that follows an answer, or null for a passive score. */
export function followUp(score: number, brand: string) {
  switch (scoreBucket(score)) {
    case "promoter":
      return {
        title: `Ask ${brand} for a referral`,
        priority: "normal",
        dueInDays: 2,
      } as const;
    case "detractor":
      return {
        title: `Rescue: ${brand} gave NPS ${score}`,
        priority: "high",
        dueInDays: 0,
      } as const;
    default:
      return null;
  }
}
