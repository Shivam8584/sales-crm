type Linked = { archivedAt?: number; mergedIntoId?: string };
type Get<D extends Linked> = (
  id: NonNullable<D["mergedIntoId"]>,
) => Promise<D | null>;

const MAX_HOPS = 5;

/** The record, or the winner it was merged into (following a chain of merges). Null if the chain breaks. */
export async function resolveMerged<D extends Linked>(
  doc: D | null,
  get: Get<D>,
): Promise<D | null> {
  for (let hop = 0; doc && hop < MAX_HOPS; hop++) {
    if (!doc.mergedIntoId) return doc;
    doc = await get(doc.mergedIntoId as NonNullable<D["mergedIntoId"]>);
  }
  return null;
}

/** The first row that is live once merged records are routed to their winner; archived ones are skipped. */
export async function firstLive<D extends Linked>(
  rows: D[],
  get: Get<D>,
): Promise<D | null> {
  for (const row of rows) {
    const doc = await resolveMerged(row, get);
    if (doc && !doc.archivedAt) return doc;
  }
  return null;
}
