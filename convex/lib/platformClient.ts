import { LOW_BALANCE_FLOOR_PAISE } from "../../lib/domain/platform";
import {
  platformState,
  type StateEvent,
} from "../../lib/domain/platform-state";

/**
 * Read-only client for the Hypedrive admin API, authenticated as a Logto M2M
 * app (client credentials). The app must be listed in LOGTO_ADMIN_APP_IDS and
 * AUTH_ADMIN_MFA_EXEMPT_CLIENT_IDS with organization:read, wallet:read,
 * campaign:read, listing:read and enrollment:read.
 *
 * Without credentials and with PLATFORM_SANDBOX=1, a sandbox answers in the same
 * shapes from the org's own webhook events, so local data stays consistent with
 * the simulator.
 */

export type PlatformMode = "live" | "sandbox";

type Env = Record<string, string | undefined>;

export const PLATFORM_ENV_HINT =
  "Set PLATFORM_API_URL, LOGTO_ENDPOINT, LOGTO_M2M_APP_ID, LOGTO_M2M_APP_SECRET and LOGTO_API_RESOURCE on the Convex deployment (or PLATFORM_SANDBOX=1 for local data).";

const LIVE_ENV = [
  "PLATFORM_API_URL",
  "LOGTO_ENDPOINT",
  "LOGTO_M2M_APP_ID",
  "LOGTO_M2M_APP_SECRET",
  "LOGTO_API_RESOURCE",
] as const;

const DEFAULT_SCOPES =
  "organization:read wallet:read campaign:read listing:read enrollment:read";

export function platformMode(env: Env): PlatformMode | null {
  if (LIVE_ENV.every((key) => env[key])) return "live";
  if (env.PLATFORM_SANDBOX === "1") return "sandbox";
  return null;
}

export type ApiOrg = {
  id: string;
  name: string;
  holder_ref?: string;
  gstin?: string;
  payment_mode?: string;
  credit_limit_paise?: number | null;
  balance_paise?: number;
  held_paise?: number;
  website_url?: string;
  support_phone?: string;
  created_at?: string;
};

export type ApiMember = {
  user_id: string;
  name?: string;
  email?: string;
  phone?: string;
  roles: string[];
};

export type ApiCampaign = {
  id: string;
  organization_id: string;
  title: string;
  status: string;
  pause_reason?: string;
  max_enrollments?: number | null;
  enrolled_count: number;
  pending_count: number;
  approved_count: number;
  submitted_at?: string | null;
  end_date?: string | null;
};

export type ApiMovement = {
  id: string;
  kind: string;
  direction?: string;
  state?: string;
  amount_paise: number;
  started_at: string;
};

export type ApiListing = {
  id: string;
  organization_id: string;
  platform_slug?: string;
  status?: string;
  created_at: string;
};

export type ApiEnrollment = {
  id: string;
  campaign_id: string;
  status?: string;
  submitted_at?: string | null;
  created_at?: string;
};

export type Triage = "stale_review" | "disputed";

export interface PlatformApi {
  mode: PlatformMode;
  org(orgId: string): Promise<ApiOrg | null>;
  members(orgId: string): Promise<ApiMember[]>;
  campaigns(orgId: string): Promise<ApiCampaign[]>;
  deposits(holderRef: string, since: Date): Promise<ApiMovement[]>;
  listings(orgId: string): Promise<ApiListing[]>;
  enrollments(campaignId: string, triage: Triage): Promise<ApiEnrollment[]>;
}

export class PlatformApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 15_000;
const PAGE_LIMIT = 100;
const MAX_PAGES = 10;

let cachedToken: { key: string; value: string; expiresAt: number } | null =
  null;

async function withTimeout(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new PlatformApiError(`Timed out after ${TIMEOUT_MS / 1000}s`);
    }
    throw new PlatformApiError(
      `Couldn't reach the platform: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function errorMessage(response: Response) {
  try {
    const body = (await response.json()) as Record<string, unknown>;
    const detail = body.detail ?? body.title ?? body.message ?? body.error;
    if (typeof detail === "string") return detail;
  } catch {}
  return response.statusText || "request failed";
}

/** An M2M access token from Logto, cached until a minute before it expires. */
async function token(env: Env, fetcher: typeof fetch, fresh = false) {
  const key = `${env.LOGTO_ENDPOINT}|${env.LOGTO_M2M_APP_ID}|${env.LOGTO_API_RESOURCE}`;
  if (!fresh && cachedToken?.key === key && cachedToken.expiresAt > Date.now())
    return cachedToken.value;
  const endpoint = env.LOGTO_ENDPOINT!.replace(/\/$/, "");
  const response = await withTimeout(fetcher, `${endpoint}/oidc/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${env.LOGTO_M2M_APP_ID}:${env.LOGTO_M2M_APP_SECRET}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      resource: env.LOGTO_API_RESOURCE!,
      scope: env.PLATFORM_API_SCOPES ?? DEFAULT_SCOPES,
    }).toString(),
  });
  if (!response.ok) {
    throw new PlatformApiError(
      `Logto token request failed (${response.status}): ${await errorMessage(response)}`,
      response.status,
    );
  }
  const body = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!body.access_token)
    throw new PlatformApiError("Logto returned no access token");
  cachedToken = {
    key,
    value: body.access_token,
    expiresAt: Date.now() + Math.max(60, (body.expires_in ?? 3600) - 60) * 1000,
  };
  return body.access_token;
}

type Query = Record<string, string | number | undefined>;

/** Admin API client over `fetch`; pages through every list it reads. */
export function liveApi(env: Env, fetcher: typeof fetch = fetch): PlatformApi {
  const base = env.PLATFORM_API_URL!.replace(/\/$/, "");

  async function get<T>(path: string, query: Query = {}): Promise<T> {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") params.set(name, String(value));
    }
    const url = `${base}/api/v1${path}${params.size ? `?${params}` : ""}`;
    const call = async (fresh: boolean) =>
      withTimeout(fetcher, url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${await token(env, fetcher, fresh)}`,
        },
      });
    let response = await call(false);
    if (response.status === 401) response = await call(true);
    if (response.status === 404) throw new PlatformApiError("Not found", 404);
    if (!response.ok) {
      throw new PlatformApiError(
        `GET ${path} failed (${response.status}): ${await errorMessage(response)}`,
        response.status,
      );
    }
    return (await response.json()) as T;
  }

  async function list<T>(path: string, query: Query = {}) {
    const rows: T[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const body = await get<{ data?: T[]; next_cursor?: string | null }>(
        path,
        { ...query, limit: PAGE_LIMIT, cursor },
      );
      rows.push(...(body.data ?? []));
      if (!body.next_cursor) break;
      cursor = body.next_cursor;
    }
    return rows;
  }

  return {
    mode: "live",
    async org(orgId) {
      let one: ApiOrg;
      try {
        one = await get<ApiOrg>(`/admin/orgs/${encodeURIComponent(orgId)}`);
      } catch (error) {
        if (error instanceof PlatformApiError && error.status === 404)
          return null;
        throw error;
      }
      // Balances are only on the list rows; a search by id finds the one row.
      const page = await get<{ data?: ApiOrg[] }>("/admin/orgs", {
        q: orgId,
        limit: 5,
      });
      const row = page.data?.find((item) => item.id === orgId);
      return {
        ...one,
        balance_paise: row?.balance_paise,
        held_paise: row?.held_paise,
      };
    },
    async members(orgId) {
      const body = await get<{ data?: ApiMember[] }>(
        `/admin/orgs/${encodeURIComponent(orgId)}/members`,
      );
      return body.data ?? [];
    },
    campaigns: (orgId) =>
      list<ApiCampaign>("/admin/campaigns", { organization_id: orgId }),
    async deposits(holderRef, since) {
      const read = (kind: string) =>
        list<ApiMovement>("/admin/movements", {
          holder_type: "organization",
          holder_id: holderRef,
          kind,
          status: "done",
          from: since.toISOString(),
        });
      const [topups, transfers] = await Promise.all([
        read("topup"),
        read("bank_deposit"),
      ]);
      return [...topups, ...transfers];
    },
    listings: (orgId) =>
      list<ApiListing>("/admin/listings", { organization_id: orgId }),
    enrollments: (campaignId, triage) =>
      list<ApiEnrollment>("/admin/enrollments", {
        campaign_id: campaignId,
        triage,
        sort: triage === "stale_review" ? "oldest_waiting" : undefined,
      }),
  };
}

export type SnapshotData = {
  balancePaise?: number;
  heldPaise?: number;
  creditLimitPaise?: number;
  paymentMode?: string;
  campaigns: {
    id: string;
    title: string;
    status: string;
    pauseReason?: string;
    enrolled: number;
    max?: number;
    pending: number;
    approved: number;
    submittedAt?: number;
    endDate?: string;
  }[];
  deposits30d: number;
  deposits90d: number;
  depositCount90d: number;
  staleReviews: number;
  oldestReviewDays?: number;
  disputes: number;
  listings: {
    marketplace: string;
    count: number;
    firstAt: number;
    latestAt: number;
  }[];
  members: {
    userId: string;
    name?: string;
    email?: string;
    phone?: string;
    roles: string[];
  }[];
};

const DAY = 24 * 60 * 60_000;
const TRACKED = ["live", "paused", "scheduled", "ended"];
const MAX_CAMPAIGN_READS = 20;

const time = (value: string | null | undefined) => {
  const at = value ? Date.parse(value) : NaN;
  return Number.isNaN(at) ? undefined : at;
};

/** Reads everything health needs about one org and folds it into a snapshot. */
export async function collectSnapshot(
  api: PlatformApi,
  orgId: string,
  now: number,
): Promise<SnapshotData | null> {
  const org = await api.org(orgId);
  if (!org) return null;
  const [members, campaigns, listings, deposits] = await Promise.all([
    api.members(orgId),
    api.campaigns(orgId),
    api.listings(orgId),
    org.holder_ref
      ? api.deposits(org.holder_ref, new Date(now - 90 * DAY))
      : Promise.resolve([]),
  ]);
  const tracked = campaigns
    .filter((campaign) => TRACKED.includes(campaign.status))
    .slice(0, MAX_CAMPAIGN_READS);
  const reviewable = tracked.filter((campaign) => campaign.status !== "ended");
  const [stale, disputed] = await Promise.all([
    Promise.all(reviewable.map((c) => api.enrollments(c.id, "stale_review"))),
    Promise.all(tracked.map((c) => api.enrollments(c.id, "disputed"))),
  ]);
  return snapshotFrom(
    {
      org,
      members,
      campaigns,
      listings,
      deposits,
      stale: stale.flat(),
      disputed: disputed.flat(),
    },
    now,
  );
}

export function snapshotFrom(
  input: {
    org: ApiOrg;
    members: ApiMember[];
    campaigns: ApiCampaign[];
    listings: ApiListing[];
    deposits: ApiMovement[];
    stale: ApiEnrollment[];
    disputed: ApiEnrollment[];
  },
  now: number,
): SnapshotData {
  const deposits = input.deposits
    .map((movement) => ({
      amount: movement.amount_paise,
      at: time(movement.started_at) ?? 0,
    }))
    .filter((item) => now - item.at <= 90 * DAY);
  const sum = (items: { amount: number }[]) =>
    items.reduce((total, item) => total + item.amount, 0);

  const waiting = input.stale.flatMap((item) => time(item.submitted_at) ?? []);
  const oldest = waiting.length ? Math.min(...waiting) : undefined;

  const markets = new Map<string, SnapshotData["listings"][number]>();
  for (const listing of input.listings) {
    if (listing.status === "archived") continue;
    const slug = listing.platform_slug || "other";
    const at = time(listing.created_at) ?? now;
    const current = markets.get(slug);
    markets.set(slug, {
      marketplace: slug,
      count: (current?.count ?? 0) + 1,
      firstAt: Math.min(current?.firstAt ?? at, at),
      latestAt: Math.max(current?.latestAt ?? at, at),
    });
  }

  return {
    balancePaise: input.org.balance_paise,
    heldPaise: input.org.held_paise,
    creditLimitPaise: input.org.credit_limit_paise ?? undefined,
    paymentMode: input.org.payment_mode,
    campaigns: input.campaigns
      .filter((campaign) => campaign.status !== "discarded")
      .map((campaign) => ({
        id: campaign.id,
        title: campaign.title,
        status: campaign.status,
        pauseReason: campaign.pause_reason || undefined,
        enrolled: campaign.enrolled_count ?? 0,
        max: campaign.max_enrollments ?? undefined,
        pending: campaign.pending_count ?? 0,
        approved: campaign.approved_count ?? 0,
        submittedAt: time(campaign.submitted_at),
        endDate: campaign.end_date ?? undefined,
      })),
    deposits30d: sum(deposits.filter((item) => now - item.at <= 30 * DAY)),
    deposits90d: sum(deposits),
    depositCount90d: deposits.length,
    staleReviews: input.stale.length,
    oldestReviewDays:
      oldest === undefined ? undefined : Math.floor((now - oldest) / DAY),
    disputes: new Set(input.disputed.map((item) => item.id)).size,
    listings: [...markets.values()].sort((a, b) => a.firstAt - b.firstAt),
    members: input.members.map((member) => ({
      userId: member.user_id,
      name: member.name || undefined,
      email: member.email || undefined,
      phone: member.phone || undefined,
      roles: member.roles ?? [],
    })),
  };
}

export type SandboxSource = {
  orgId: string;
  name: string;
  domain?: string;
  /** Processed webhook events for the org. */
  events: StateEvent[];
  /** People on the account already linked to a platform user; the first is the creator. */
  people: { userId: string; name: string; email?: string; phone?: string }[];
};

function seeded(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return ((hash ^= hash >>> 16) >>> 0) / 4294967296;
  };
}

const iso = (at: number) => new Date(at).toISOString();

const FINANCE_NAMES = [
  "Pooja Menon",
  "Rakesh Gupta",
  "Shreya Das",
  "Manoj Kulkarni",
  "Divya Narang",
];

/** Admin API answers for one org, derived from its own events so they agree with the simulator. */
export function sandboxApi(source: SandboxSource, now: number): PlatformApi {
  const random = seeded(source.orgId);
  const state = platformState(source.events, now);
  const created = state.orgCreatedAt ?? now - 30 * DAY;
  const holderRef = `ORW-${source.orgId.slice(-6).toUpperCase()}`;

  const spent = Math.round(state.funding.totalPaise * (0.45 + random() * 0.2));
  const balance =
    state.wallet.balancePaise ??
    (state.wallet.status === "negative"
      ? -1_250_000
      : state.wallet.status === "low"
        ? Math.round(LOW_BALANCE_FLOOR_PAISE * 0.6)
        : state.funding.totalPaise - spent);

  const campaigns: ApiCampaign[] = state.campaigns.map((campaign, index) => {
    const max = 20 + Math.floor(random() * 4) * 10;
    const share =
      campaign.slotsFilledAt !== undefined
        ? 1
        : campaign.status === "ended"
          ? 0.85 + random() * 0.15
          : campaign.status === "live" || campaign.status === "paused"
            ? 0.3 + random() * 0.5
            : 0;
    const enrolled = Math.round(max * share);
    const approved =
      state.approvals > 0 && index === 0
        ? Math.max(1, Math.round(enrolled * 0.4))
        : 0;
    return {
      id: campaign.id,
      organization_id: source.orgId,
      title: campaign.title ?? `Campaign ${index + 1}`,
      status: campaign.status,
      pause_reason: campaign.pauseReason,
      max_enrollments: max,
      enrolled_count: enrolled,
      pending_count: Math.max(0, enrolled - approved - 2),
      approved_count: approved,
      submitted_at: campaign.submittedAt ? iso(campaign.submittedAt) : null,
      end_date: iso((campaign.endedAt ?? campaign.since) + 30 * DAY).slice(
        0,
        10,
      ),
    };
  });

  const deposits: ApiMovement[] = source.events
    .filter(
      (event) =>
        event.type === "wallet.topup_succeeded" ||
        event.type === "wallet.deposit_received",
    )
    .map((event, index) => ({
      id: `wpy_sandbox_${index}`,
      kind: event.type === "wallet.deposit_received" ? "bank_deposit" : "topup",
      direction: "in",
      state: "done",
      amount_paise: Number(event.data?.amount_paise ?? 0),
      started_at: iso(event.occurredAt),
    }));

  const listings: ApiListing[] = [];
  if (state.orgCreatedAt !== null) {
    const base = 1 + Math.floor(random() * 3);
    for (let index = 0; index < base; index++) {
      listings.push({
        id: `lst_sandbox_${index}`,
        organization_id: source.orgId,
        platform_slug: "amazon",
        status: "active",
        created_at: iso(created + (index + 1) * 60 * 60_000),
      });
    }
  }
  for (const [index, listing] of state.listings.entries()) {
    listings.push({
      id: `lst_sandbox_event_${index}`,
      organization_id: source.orgId,
      platform_slug: listing.slug,
      status: "active",
      created_at: iso(listing.at),
    });
  }

  const stale = new Map<string, ApiEnrollment[]>();
  for (const review of state.reviews) {
    stale.set(
      review.campaignId,
      Array.from({ length: review.count }, (_, index) => ({
        id: `enr_sandbox_${review.campaignId}_${index}`,
        campaign_id: review.campaignId,
        status: "in_review",
        submitted_at: iso(
          review.oldestAt +
            (index * (review.reportedAt - review.oldestAt)) /
              Math.max(1, review.count),
        ),
      })),
    );
  }
  const disputedCampaign =
    state.approvals > 0 && random() < 0.25 ? campaigns[0]?.id : undefined;

  const members: ApiMember[] = source.people.map((person, index) => ({
    user_id: person.userId,
    name: person.name,
    email: person.email,
    phone: person.phone,
    roles: index === 0 ? ["owner"] : ["campaign_manager"],
  }));
  for (const joined of state.members) {
    if (members.some((member) => member.user_id === joined.userId)) continue;
    const event = source.events.find(
      (item) =>
        item.type === "member.joined" && item.data?.user_id === joined.userId,
    );
    members.push({
      user_id: joined.userId,
      name: typeof event?.data?.name === "string" ? event.data.name : undefined,
      email:
        typeof event?.data?.email === "string" ? event.data.email : undefined,
      roles: [joined.role],
    });
  }
  if (state.funding.count > 0 && source.domain) {
    const name = FINANCE_NAMES[Math.floor(random() * FINANCE_NAMES.length)];
    const userId = `usr_sandbox_fin_${source.orgId.slice(-8)}`;
    if (
      !members.some(
        (member) =>
          member.user_id === userId || member.roles.includes("finance_manager"),
      )
    ) {
      members.push({
        user_id: userId,
        name,
        email: `accounts@${source.domain}`,
        roles: ["finance_manager"],
      });
    }
  }

  const org: ApiOrg = {
    id: source.orgId,
    name: source.name,
    holder_ref: holderRef,
    payment_mode: "prepaid",
    balance_paise: balance,
    held_paise: Math.max(0, Math.round(spent * 0.15)),
    created_at: iso(created),
  };

  return {
    mode: "sandbox",
    org: async (orgId) => (orgId === source.orgId ? org : null),
    members: async () => members,
    campaigns: async () => campaigns,
    deposits: async (_ref, since) =>
      deposits.filter((item) => Date.parse(item.started_at) >= since.getTime()),
    listings: async () => listings,
    enrollments: async (campaignId, triage) =>
      triage === "stale_review"
        ? (stale.get(campaignId) ?? [])
        : campaignId === disputedCampaign
          ? [
              {
                id: `enr_sandbox_dispute_${campaignId}`,
                campaign_id: campaignId,
              },
            ]
          : [],
  };
}
