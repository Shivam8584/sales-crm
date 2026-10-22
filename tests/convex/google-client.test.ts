import { describe, expect, it, vi } from "vitest";
import {
  GoogleError,
  SCOPES,
  accessToken,
  authUrl,
  eventsBetween,
  exchangeCode,
  messagesAddedSince,
  messagesMetadata,
  revoke,
  type Fetch,
  type OAuthConfig,
} from "../../convex/lib/google/client";

const config: OAuthConfig = {
  clientId: "id",
  clientSecret: "secret",
  redirectUri: "https://site.example/google/callback",
};

const reply = (...responses: Response[]) => {
  const queue = [...responses];
  const fetchMock = vi.fn(async () => queue.shift() ?? new Response("{}"));
  return { f: fetchMock as unknown as Fetch, fetchMock };
};

const urlOf = (fetchMock: ReturnType<typeof vi.fn>, call: number) =>
  String(fetchMock.mock.calls[call][0]);

describe("Google client", () => {
  it("asks for offline, read-only access and nothing else", () => {
    const url = new URL(authUrl(config, "state-1"));
    expect(url.searchParams.get("scope")).toBe(SCOPES.join(" "));
    expect(SCOPES.every((scope) => scope.endsWith(".readonly"))).toBe(true);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBe("state-1");
  });

  it("exchanges a code and reports whether every scope was granted", async () => {
    const { f, fetchMock } = reply(
      Response.json({
        access_token: "a",
        refresh_token: "r",
        scope: SCOPES.join(" "),
      }),
      Response.json({ access_token: "a", scope: SCOPES[0] }),
    );
    expect(await exchangeCode(f, config, "code")).toEqual({
      accessToken: "a",
      refreshToken: "r",
      granted: true,
    });
    expect(await exchangeCode(f, config, "code")).toMatchObject({
      refreshToken: null,
      granted: false,
    });
    const body = String(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body,
    );
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("client_secret=secret");
  });

  it("flags a revoked refresh token as needing a reconnect", async () => {
    const { f } = reply(
      new Response('{"error":"invalid_grant"}', { status: 400 }),
      new Response("{}", { status: 503 }),
    );
    const revoked = await accessToken(f, config, "r").catch((error) => error);
    expect(revoked).toBeInstanceOf(GoogleError);
    expect(revoked.needsReconnect).toBe(true);
    const down = await accessToken(f, config, "r").catch((error) => error);
    expect(down.needsReconnect).toBe(false);
    expect(down.message).not.toContain("secret");
  });

  it("never throws when revoking", async () => {
    const f = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as Fetch;
    await expect(revoke(f, "r")).resolves.toBeUndefined();
  });

  it("follows Gmail history pages and treats expired history as null", async () => {
    const { f, fetchMock } = reply(
      Response.json({
        history: [{ messagesAdded: [{ message: { id: "a" } }] }],
        historyId: "11",
        nextPageToken: "p2",
      }),
      Response.json({
        history: [
          {
            messagesAdded: [{ message: { id: "a" } }, { message: { id: "b" } }],
          },
        ],
        historyId: "12",
      }),
    );
    expect(await messagesAddedSince(f, "tok", "10")).toEqual({
      ids: ["a", "b"],
      historyId: "12",
    });
    expect(urlOf(fetchMock, 1)).toContain("pageToken=p2");
    const gone = reply(
      new Response('{"error":{"status":"NOT_FOUND"}}', { status: 404 }),
    );
    expect(await messagesAddedSince(gone.f, "tok", "1")).toBeNull();
    const failing = reply(new Response("{}", { status: 500 }));
    await expect(
      messagesAddedSince(failing.f, "tok", "1"),
    ).rejects.toBeInstanceOf(GoogleError);
  });

  it("fetches metadata only and skips messages deleted meanwhile", async () => {
    const { f, fetchMock } = reply(
      Response.json({ id: "a" }),
      new Response("{}", { status: 404 }),
    );
    expect(await messagesMetadata(f, "tok", ["a", "b"])).toEqual([{ id: "a" }]);
    for (const [url] of fetchMock.mock.calls as unknown as [string][]) {
      expect(url).toContain("format=metadata");
      expect(url).not.toContain("format=full");
    }
  });

  it("pages through calendar events with recurring ones expanded", async () => {
    const { f, fetchMock } = reply(
      Response.json({ items: [{ id: "1" }], nextPageToken: "n" }),
      Response.json({ items: [{ id: "2" }] }),
    );
    const events = await eventsBetween(f, "tok", 0, 86_400_000);
    expect(events.map((event) => event.id)).toEqual(["1", "2"]);
    expect(urlOf(fetchMock, 0)).toContain("singleEvents=true");
    expect(urlOf(fetchMock, 0)).toContain("timeMin=1970-01-01");
  });
});
