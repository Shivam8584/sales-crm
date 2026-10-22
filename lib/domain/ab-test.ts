/**
 * Split tests on an email step: version B replaces the subject and/or body,
 * each enrolment gets one version for good, and results are plain counts.
 */

export const VARIANTS = ["a", "b"] as const;
export type Variant = (typeof VARIANTS)[number];

/** What version B changes; anything left out is taken from version A. */
export type AbConfig = {
  subject?: string;
  body?: string;
  /** Percent of enrolments that get version B, 0 to 100. */
  splitB: number;
};

/** Sends each version needs before a comparison means anything. */
export const AB_MIN_SAMPLE = 30;
/** Reply rates closer than this many percentage points are called even. */
export const AB_EVEN_POINTS = 2;

export function hasVariantB(ab: AbConfig | undefined): ab is AbConfig {
  return Boolean(ab && (ab.subject?.trim() || ab.body?.trim()));
}

function bucket(seed: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100;
}

/**
 * The same seed always gets the same version, and a version already given to
 * this enrolment wins, so editing the split never flips someone mid-sequence.
 * A split of 0 or 100 is a declared winner and overrides the earlier version.
 */
export function pickVariant(
  ab: AbConfig | undefined,
  seed: string,
  previous?: Variant,
): Variant {
  if (!hasVariantB(ab) || ab.splitB <= 0) return "a";
  if (ab.splitB >= 100) return "b";
  return previous ?? (bucket(seed) < ab.splitB ? "b" : "a");
}

export function variantContent(
  email: { subject: string; body: string; ab?: AbConfig },
  variant: Variant,
) {
  if (variant === "a" || !email.ab) {
    return { subject: email.subject, body: email.body };
  }
  return {
    subject: email.ab.subject?.trim() ? email.ab.subject : email.subject,
    body: email.ab.body?.trim() ? email.ab.body : email.body,
  };
}

export type Tally = { sent: number; replied: number };

export type Comparison =
  | { state: "too_early"; need: number }
  | { state: "even" }
  | { state: "ahead"; leader: Variant; points: number };

const rate = (tally: Tally) => (tally.sent ? tally.replied / tally.sent : 0);

export function compareVariants(a: Tally, b: Tally): Comparison {
  if (Math.min(a.sent, b.sent) < AB_MIN_SAMPLE) {
    return { state: "too_early", need: AB_MIN_SAMPLE };
  }
  const points = Math.round((rate(b) - rate(a)) * 1000) / 10;
  if (Math.abs(points) < AB_EVEN_POINTS) return { state: "even" };
  return {
    state: "ahead",
    leader: points > 0 ? "b" : "a",
    points: Math.abs(points),
  };
}

export function describeComparison(a: Tally, b: Tally) {
  const result = compareVariants(a, b);
  if (result.state === "too_early") {
    return `Too early to call: each version needs ${result.need} sent emails (A has ${a.sent}, B has ${b.sent}).`;
  }
  if (result.state === "even") {
    return `No clear difference: reply rates are within ${AB_EVEN_POINTS} points.`;
  }
  return `${result.leader.toUpperCase()} is ahead by ${result.points} points. This is a count comparison, not a significance test.`;
}
