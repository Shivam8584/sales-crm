/**
 * Mentions are stored in a timeline body as `<@memberId>` tokens so a rename
 * shows the new name everywhere; the composer shows them as `@Name` while
 * typing and encodes them on submit.
 */

export type MentionPick = { id: string; name: string };

export type BodySegment =
  | { type: "text"; text: string }
  | { type: "mention"; id: string };

const TOKEN = /<@([a-z0-9]+)>/g;
const MAX_QUERY = 40;

export function mentionToken(id: string) {
  return `<@${id}>`;
}

/** Text and mention segments, in order. */
export function parseBody(body: string): BodySegment[] {
  const segments: BodySegment[] = [];
  let last = 0;
  for (const match of body.matchAll(TOKEN)) {
    const at = match.index ?? 0;
    if (at > last) segments.push({ type: "text", text: body.slice(last, at) });
    segments.push({ type: "mention", id: match[1] });
    last = at + match[0].length;
  }
  if (last < body.length)
    segments.push({ type: "text", text: body.slice(last) });
  return segments;
}

/** Distinct mentioned ids, in order of first appearance. */
export function mentionIds(body: string | undefined) {
  if (!body) return [];
  return [...new Set([...body.matchAll(TOKEN)].map((match) => match[1]))];
}

/** The ids in `after` that weren't in `before`. */
export function addedMentions<T extends string>(
  before: readonly T[],
  after: readonly T[],
) {
  const previous = new Set<string>(before);
  return after.filter((id) => !previous.has(id));
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replaces each picked `@Name` in typed text with its token. Longer names win,
 * so "@Ravi Kumar" isn't read as "@Ravi"; an `@` inside a word (an email) is
 * never a mention.
 */
export function encodeMentions(text: string, picks: readonly MentionPick[]) {
  const byName = new Map<string, string>();
  for (const pick of picks) {
    const name = pick.name.trim();
    if (name && !byName.has(name.toLowerCase())) {
      byName.set(name.toLowerCase(), pick.id);
    }
  }
  if (byName.size === 0) return text;
  const names = [...byName.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}_@])@(${names.map(escape).join("|")})(?![\\p{L}\\p{N}_])`,
    "giu",
  );
  return text.replace(
    pattern,
    (_, before: string, name: string) =>
      `${before}${mentionToken(byName.get(name.toLowerCase())!)}`,
  );
}

/** The editable text for a stored body, and the mentions it carries. */
export function decodeMentions(
  body: string,
  nameOf: (id: string) => string | undefined,
): { text: string; picks: MentionPick[] } {
  const picks: MentionPick[] = [];
  const text = parseBody(body)
    .map((segment) => {
      if (segment.type === "text") return segment.text;
      const name = nameOf(segment.id);
      if (!name) return mentionToken(segment.id);
      if (!picks.some((pick) => pick.id === segment.id)) {
        picks.push({ id: segment.id, name });
      }
      return `@${name}`;
    })
    .join("");
  return { text, picks };
}

/** Plain text with mentions written as `@Name`, e.g. for a notification preview. */
export function bodyText(
  body: string,
  nameOf: (id: string) => string | undefined,
) {
  return parseBody(body)
    .map((segment) =>
      segment.type === "text"
        ? segment.text
        : `@${nameOf(segment.id) ?? "someone"}`,
    )
    .join("");
}

/**
 * The `@query` being typed just before the caret, if any. A query may hold one
 * space, so "@Ravi K" still narrows to Ravi Kumar.
 */
export function activeMention(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  const prev = at > 0 ? before[at - 1] : "";
  if (prev && !/[\s([{"'“‘]/.test(prev)) return null;
  const query = before.slice(at + 1);
  if (query.length > MAX_QUERY || /[\n@]/.test(query)) return null;
  if (query.startsWith(" ") || (query.match(/ /g)?.length ?? 0) > 1) {
    return null;
  }
  return { start: at, query };
}

/** Whether a member matches what was typed: any word of the name or the email starts with it. */
export function matchesMention(
  member: { name: string; email?: string },
  query: string,
) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const name = member.name.toLowerCase();
  if (name.startsWith(needle)) return true;
  if (name.split(/\s+/).some((word) => word.startsWith(needle))) return true;
  return member.email?.toLowerCase().startsWith(needle) ?? false;
}

/** Inserts `@Name ` in place of the active query and returns the new text and caret. */
export function insertMention(
  text: string,
  range: { start: number; end: number },
  name: string,
) {
  const after = text.slice(range.end);
  const spacer = after.startsWith(" ") ? "" : " ";
  const inserted = `@${name}${spacer}`;
  return {
    text: text.slice(0, range.start) + inserted + after,
    caret: range.start + inserted.length + (spacer ? 0 : 1),
  };
}
