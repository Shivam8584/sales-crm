/** Thin Google OAuth, Gmail and Calendar calls; `fetch` is injected so tests never touch the network. */
import type { GmailMessage, GoogleEvent } from "../../../lib/domain/mail-sync";

export type Fetch = typeof fetch;
export type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
];

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const CALENDAR =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const MAX_PAGES = 5;
const PAGE_SIZE = 100;
const FETCH_CONCURRENCY = 8;

export class GoogleError extends Error {
  constructor(
    readonly status: number,
    /** Google's `error` code or `reason`, e.g. `invalid_grant`. */
    readonly reason: string,
  ) {
    super(`Google responded ${status} ${reason}`);
  }

  /** The user revoked access or the refresh token expired: only reconnecting helps. */
  get needsReconnect() {
    return this.reason === "invalid_grant" || this.status === 401;
  }
}

async function check(response: Response) {
  if (response.ok) return response;
  let reason = "error";
  try {
    const body = (await response.json()) as {
      error?: string | { status?: string; errors?: { reason?: string }[] };
    };
    reason =
      typeof body.error === "string"
        ? body.error
        : (body.error?.errors?.[0]?.reason ?? body.error?.status ?? reason);
  } catch {
    // keep the generic reason
  }
  throw new GoogleError(response.status, reason);
}

export function authUrl(config: OAuthConfig, state: string) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function tokenRequest(
  f: Fetch,
  config: OAuthConfig,
  body: Record<string, string>,
) {
  const response = await check(
    await f(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        ...body,
      }),
    }),
  );
  return (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    scope?: string;
  };
}

export async function exchangeCode(
  f: Fetch,
  config: OAuthConfig,
  code: string,
) {
  const tokens = await tokenRequest(f, config, {
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
  });
  const scopes = (tokens.scope ?? "").split(" ");
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    granted: SCOPES.every((scope) => scopes.includes(scope)),
  };
}

export async function accessToken(
  f: Fetch,
  config: OAuthConfig,
  refreshToken: string,
) {
  const tokens = await tokenRequest(f, config, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return tokens.access_token;
}

/** Best effort: a token that is already dead needs no revoking. */
export async function revoke(f: Fetch, token: string) {
  await f("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  }).catch(() => undefined);
}

async function get<T>(f: Fetch, token: string, url: string) {
  const response = await check(
    await f(url, { headers: { Authorization: `Bearer ${token}` } }),
  );
  return (await response.json()) as T;
}

export async function gmailProfile(f: Fetch, token: string) {
  return await get<{ emailAddress: string; historyId: string }>(
    f,
    token,
    `${GMAIL}/profile`,
  );
}

/** Ids of messages added since `startHistoryId`, or null when Gmail no longer has that history. */
export async function messagesAddedSince(
  f: Fetch,
  token: string,
  startHistoryId: string,
) {
  const ids = new Set<string>();
  let historyId = startHistoryId;
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      startHistoryId,
      historyTypes: "messageAdded",
      maxResults: String(PAGE_SIZE),
    });
    if (pageToken) params.set("pageToken", pageToken);
    let body: {
      history?: { messagesAdded?: { message: { id: string } }[] }[];
      historyId?: string;
      nextPageToken?: string;
    };
    try {
      body = await get(f, token, `${GMAIL}/history?${params}`);
    } catch (error) {
      if (error instanceof GoogleError && error.status === 404) return null;
      throw error;
    }
    for (const item of body.history ?? []) {
      for (const added of item.messagesAdded ?? []) ids.add(added.message.id);
    }
    historyId = body.historyId ?? historyId;
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return { ids: [...ids], historyId };
}

/** The newest message ids from the last `days`, for a first sync. */
export async function recentMessageIds(f: Fetch, token: string, days: number) {
  const params = new URLSearchParams({
    q: `newer_than:${days}d -in:spam -in:trash -in:drafts`,
    maxResults: String(PAGE_SIZE),
  });
  const body = await get<{ messages?: { id: string }[] }>(
    f,
    token,
    `${GMAIL}/messages?${params}`,
  );
  return (body.messages ?? []).map((message) => message.id);
}

/** Headers, labels and snippet only; Gmail never sends the body for this format. */
export async function messageMetadata(f: Fetch, token: string, id: string) {
  const params = new URLSearchParams({ format: "metadata" });
  for (const header of ["From", "To", "Cc", "Subject", "Message-ID"]) {
    params.append("metadataHeaders", header);
  }
  try {
    return await get<GmailMessage>(
      f,
      token,
      `${GMAIL}/messages/${encodeURIComponent(id)}?${params}`,
    );
  } catch (error) {
    if (error instanceof GoogleError && error.status === 404) return null;
    throw error;
  }
}

export async function messagesMetadata(f: Fetch, token: string, ids: string[]) {
  const out: GmailMessage[] = [];
  for (let i = 0; i < ids.length; i += FETCH_CONCURRENCY) {
    const batch = await Promise.all(
      ids
        .slice(i, i + FETCH_CONCURRENCY)
        .map((id) => messageMetadata(f, token, id)),
    );
    for (const message of batch) if (message) out.push(message);
  }
  return out;
}

/** Non-cancelled events that start in the window, instances of recurring ones expanded. */
export async function eventsBetween(
  f: Fetch,
  token: string,
  from: number,
  to: number,
) {
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      timeMin: new Date(from).toISOString(),
      timeMax: new Date(to).toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const body = await get<{ items?: GoogleEvent[]; nextPageToken?: string }>(
      f,
      token,
      `${CALENDAR}?${params}`,
    );
    events.push(...(body.items ?? []));
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return events;
}
