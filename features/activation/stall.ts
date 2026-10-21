const HOUR = 60 * 60_000;

/** "26 hours", "4 days": how long a brand has sat on a step. */
export function stuckFor(since: number, now = Date.now()) {
  const ms = now - since;
  const hours = Math.max(1, Math.floor(ms / HOUR));
  if (hours < 48) return hours === 1 ? "1 hour" : `${hours} hours`;
  return `${Math.floor(ms / (24 * HOUR))} days`;
}

/** The playbook's first sentence, for places with room for one line. */
export function firstSentence(text: string) {
  const match = text.match(/^.+?[.!?](?=\s|$)/);
  return match ? match[0] : text;
}
