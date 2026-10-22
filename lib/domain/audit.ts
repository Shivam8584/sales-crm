export const DELETED_KEEP_DAYS = 30;
export const EDITS_KEEP_DAYS = 365;
export const DAY_MS = 24 * 60 * 60_000;

/** A row's place in a newest-first stream: when it happened, then when it was written. */
export type Key = { at: number; ct: number };

export type Source<T extends Key> = {
  rows: T[];
  /** Where the scan stopped early; null when the source ran dry. */
  reach: Key | null;
};

export const isBefore = (a: Key, b: Key) =>
  a.at < b.at || (a.at === b.at && a.ct < b.ct);

export const encodeCursor = (key: Key) => `${key.at}:${key.ct}`;

export function decodeCursor(cursor: string | null | undefined): Key | null {
  const match = cursor?.match(/^(\d+):(\d+(?:\.\d+)?)$/);
  return match ? { at: Number(match[1]), ct: Number(match[2]) } : null;
}

export async function* keyed<D, R extends Key>(
  docs: AsyncIterable<D>,
  make: (doc: D) => R,
) {
  for await (const doc of docs) yield make(doc);
}

/**
 * Walks a newest-first stream past `before`, keeping matches. Stops after
 * `limit + 1` matches or `maxScan` rows so a rare filter can't read the table.
 */
export async function scan<T extends Key>(
  rows: AsyncIterable<T>,
  keep: (row: T) => boolean,
  {
    before,
    limit,
    maxScan,
  }: { before: Key | null; limit: number; maxScan: number },
): Promise<Source<T>> {
  const kept: T[] = [];
  let scanned = 0;
  for await (const row of rows) {
    if (before && !isBefore(row, before)) continue;
    scanned++;
    if (keep(row)) kept.push(row);
    if (kept.length > limit || scanned >= maxScan) {
      return { rows: kept, reach: { at: row.at, ct: row.ct } };
    }
  }
  return { rows: kept, reach: null };
}

/**
 * One page out of several newest-first sources. Only rows at or after the
 * oldest point every unfinished source has reached are certain, so the page
 * stops there and `next` says where to resume (null once everything is read).
 */
export function mergePage<T extends Key>(sources: Source<T>[], limit: number) {
  let floor: Key | null = null;
  for (const { reach } of sources) {
    if (reach && (!floor || isBefore(floor, reach))) floor = reach;
  }
  const certain = sources
    .flatMap((source) => source.rows)
    .filter((row) => !floor || !isBefore(row, floor))
    .sort((a, b) => (isBefore(a, b) ? 1 : isBefore(b, a) ? -1 : 0));
  if (certain.length <= limit) return { rows: certain, next: floor };
  const rows = certain.slice(0, limit);
  const last = rows[limit - 1];
  return { rows, next: { at: last.at, ct: last.ct } };
}
