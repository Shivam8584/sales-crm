import { v } from "convex/values";
import type { FunctionReturnType, PaginationResult } from "convex/server";
import { api, internal } from "./_generated/api";
import { action } from "./_generated/server";
import { vListArgs as accountArgs } from "./accounts";
import { vListArgs as dealArgs } from "./deals";
import { vListArgs as leadArgs } from "./leads";
import { fail } from "./lib/errors";
import { internalMutation, memberQuery } from "./lib/functions";
import { assertCan } from "./lib/permissions";
import { vListArgs as peopleArgs } from "./people";
import { HEALTH_BAND_LABEL } from "../lib/domain/health";
import {
  DEAL_STAGE_LABEL,
  LEAD_KIND_LABEL,
  LEAD_STATUS_LABEL,
  STAGE_LABEL,
} from "../lib/domain/labels";
import { formatMoney, toMajor } from "../lib/domain/money";
import { ACTIVATION_STAGES } from "../lib/domain/platform";
import { toCsv, type CsvCell } from "../lib/csv";

const BATCH = 100;
// Leads and deals are listed one page after another, so bigger pages save round trips.
const PAGE = 500;
const IDS_PAGE = 2000;
const PARALLEL = 8;
const MAX_ROWS = 50_000;
const KEEP_FILE_MS = 5 * 60_000;

type Row = CsvCell[];
type Page<T> = PaginationResult<T>;

const iso = (at: number | null | undefined) =>
  at ? new Date(at).toISOString() : "";

type AccountRow = FunctionReturnType<typeof api.accounts.exportRows>[number];
type PersonRow = FunctionReturnType<typeof api.people.exportRows>[number];
type LeadRow = FunctionReturnType<typeof api.leads.page>["page"][number];
type DealRow = FunctionReturnType<typeof api.deals.page>["page"][number];

function interaction(last: { at: number; kind: string } | null) {
  return last ? `${iso(last.at)} ${last.kind}` : "";
}

const ACCOUNT_HEADER = [
  "Name",
  "Website",
  "Stage",
  "Owner",
  "People",
  "Open deals",
  "Pipeline",
  "On platform",
  "Activation",
  "Health",
  "GSTIN",
  "GST verified",
  "Tags",
  "Last interaction",
  "Last activity",
];

function accountCells(row: AccountRow): Row {
  const steps = !row.onPlatform
    ? null
    : row.stage === "expanding"
      ? ACTIVATION_STAGES.length
      : (ACTIVATION_STAGES as readonly string[]).indexOf(row.stage) + 1;
  return [
    row.name,
    row.domain ?? "",
    STAGE_LABEL[row.stage],
    row.owner?.name ?? "",
    row.peopleCount,
    row.openDeals,
    row.pipeline
      .filter((money) => money.amount > 0)
      .map((money) => formatMoney(money))
      .join(" + "),
    row.onPlatform ? "Yes" : "No",
    steps === null
      ? ""
      : `${Math.round((steps / ACTIVATION_STAGES.length) * 100)}%`,
    row.health
      ? `${row.health.score} ${HEALTH_BAND_LABEL[row.health.band as keyof typeof HEALTH_BAND_LABEL]}`
      : "",
    row.gstin ?? "",
    row.gstVerified ? "Yes" : "No",
    row.tags.join(", "),
    interaction(row.lastInteraction),
    iso(row.lastActivityAt),
  ];
}

const PERSON_HEADER = [
  "First name",
  "Last name",
  "Email",
  "Phone",
  "Title",
  "Account",
  "LinkedIn",
  "Owner",
  "Tags",
  "Last interaction",
  "Last activity",
];

function personCells(row: PersonRow): Row {
  return [
    row.firstName,
    row.lastName,
    row.email ?? "",
    row.phone ?? "",
    row.title ?? "",
    row.account?.name ?? "",
    row.linkedinUrl ?? "",
    row.owner?.name ?? "",
    row.tags.join(", "),
    interaction(row.lastInteraction),
    iso(row.lastActivityAt),
  ];
}

const LEAD_HEADER = [
  "Name",
  "Account",
  "Email",
  "Phone",
  "Kind",
  "Status",
  "Source",
  "Campaign",
  "Owner",
  "Received",
  "First touch",
  "Speed to lead (min)",
  "Demo",
];

function leadCells(row: LeadRow): Row {
  return [
    row.name,
    row.companyName,
    row.email ?? "",
    row.phone ?? "",
    LEAD_KIND_LABEL[row.kind],
    LEAD_STATUS_LABEL[row.status],
    row.channel,
    row.utm.campaign ?? "",
    row.owner?.name ?? "",
    iso(row._creationTime),
    iso(row.firstTouchedAt),
    row.firstTouchedAt
      ? Math.round((row.firstTouchedAt - row._creationTime) / 6000) / 10
      : "",
    iso(row.demoAt),
  ];
}

const DEAL_HEADER = [
  "Title",
  "Account",
  "Stage",
  "Amount",
  "Currency",
  "Owner",
  "Close date",
  "Lost reason",
];

function dealCells(row: DealRow): Row {
  return [
    row.title,
    row.account?.name ?? "",
    DEAL_STAGE_LABEL[row.stage],
    toMajor(row.amount),
    row.amount.currency,
    row.owner?.name ?? "",
    row.closeDate ?? "",
    row.lostReason ?? "",
  ];
}

function tooMany(): never {
  return fail(
    "invalid",
    `This list has more than ${MAX_ROWS.toLocaleString("en-IN")} rows. Narrow the filters to export it.`,
  );
}

async function collect<T>(
  fetch: (cursor: string | null) => Promise<Page<T>>,
  cells: (row: T) => Row,
) {
  const rows: Row[] = [];
  let cursor: string | null = null;
  for (;;) {
    const result: Page<T> = await fetch(cursor);
    rows.push(...result.page.map(cells));
    if (rows.length > MAX_ROWS) tooMany();
    if (result.isDone) return rows;
    cursor = result.continueCursor;
  }
}

type IdsPage<I> = { ids: I[]; isDone: boolean; continueCursor: string };

/**
 * Lists with costly rows: the ids are listed a page at a time while their rows
 * are already being built, a few batches in parallel.
 */
async function collectByIds<I, R>(
  ids: (cursor: string | null) => Promise<IdsPage<I>>,
  rows: (ids: I[]) => Promise<R[]>,
  cells: (row: R) => Row,
) {
  let active = 0;
  const waiting: (() => void)[] = [];
  const limited = async (batch: I[]) => {
    if (active >= PARALLEL) await new Promise<void>((go) => waiting.push(go));
    active++;
    try {
      return await rows(batch);
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
  const built: Promise<R[]>[] = [];
  let count = 0;
  let cursor: string | null = null;
  for (;;) {
    const result: IdsPage<I> = await ids(cursor);
    count += result.ids.length;
    if (count > MAX_ROWS) tooMany();
    for (let i = 0; i < result.ids.length; i += BATCH) {
      const job = limited(result.ids.slice(i, i + BATCH));
      job.catch(() => undefined);
      built.push(job);
    }
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  return (await Promise.all(built)).flat().map(cells);
}

/** Bulk downloads are for managers and admins; the CSV action calls this first so reps are refused. */
export const assertCanExport = memberQuery({
  args: {},
  handler: async (ctx) => {
    assertCan(ctx.viewer, "record.export");
  },
});

/**
 * The whole filtered list as a CSV file, built from the list's own filters and
 * row builders so the export always matches what the list shows. Accounts and
 * people have costly rows, so their ids are listed first and the rows are built
 * in parallel. Returns a short-lived download URL.
 */
export const csv = action({
  args: {
    list: v.union(
      v.object({ name: v.literal("accounts"), args: v.object(accountArgs) }),
      v.object({ name: v.literal("people"), args: v.object(peopleArgs) }),
      v.object({ name: v.literal("leads"), args: v.object(leadArgs) }),
      v.object({ name: v.literal("deals"), args: v.object(dealArgs) }),
    ),
  },
  handler: async (ctx, { list }): Promise<{ url: string; count: number }> => {
    await ctx.runQuery(api.exports.assertCanExport, {});
    const opts = (cursor: string | null) => ({ numItems: PAGE, cursor });
    const idsOpts = (cursor: string | null) => ({
      numItems: IDS_PAGE,
      cursor,
    });
    let table: Row[];
    if (list.name === "accounts") {
      const { args } = list;
      table = [
        ACCOUNT_HEADER,
        ...(await collectByIds(
          (cursor) =>
            ctx.runQuery(api.accounts.exportIds, {
              ...args,
              paginationOpts: idsOpts(cursor),
            }),
          (ids) => ctx.runQuery(api.accounts.exportRows, { ids }),
          accountCells,
        )),
      ];
    } else if (list.name === "people") {
      const { args } = list;
      table = [
        PERSON_HEADER,
        ...(await collectByIds(
          (cursor) =>
            ctx.runQuery(api.people.exportIds, {
              ...args,
              paginationOpts: idsOpts(cursor),
            }),
          (ids) => ctx.runQuery(api.people.exportRows, { ids }),
          personCells,
        )),
      ];
    } else if (list.name === "leads") {
      const { args } = list;
      table = [
        LEAD_HEADER,
        ...(await collect(
          (cursor) =>
            ctx.runQuery(api.leads.page, {
              ...args,
              paginationOpts: opts(cursor),
            }),
          leadCells,
        )),
      ];
    } else {
      const { args } = list;
      table = [
        DEAL_HEADER,
        ...(await collect(
          (cursor) =>
            ctx.runQuery(api.deals.page, {
              ...args,
              paginationOpts: opts(cursor),
            }),
          dealCells,
        )),
      ];
    }
    const blob = new Blob(["\uFEFF", toCsv(table)], {
      type: "text/csv;charset=utf-8",
    });
    const id = await ctx.storage.store(blob);
    await ctx.scheduler.runAfter(KEEP_FILE_MS, internal.exports.discard, {
      id,
    });
    const url = await ctx.storage.getUrl(id);
    if (!url) throw new Error("The export file is missing");
    return { url, count: table.length - 1 };
  },
});

export const discard = internalMutation({
  args: { id: v.id("_storage") },
  handler: async (ctx, { id }) => {
    await ctx.storage.delete(id);
  },
});
