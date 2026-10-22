export const DEFAULT_BODY_LIMIT = 32 * 1024;

/** Origins from a comma-separated env var, or `defaults` when it is unset. */
export function allowedOrigins(envName: string, defaults: string[]) {
  const list = (process.env[envName] ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return list.length > 0 ? list : defaults;
}

/** The CRM's own origin (SITE_URL); localhost too unless the site is served over https. */
export function siteOrigins() {
  const site = process.env.SITE_URL?.replace(/\/$/, "");
  if (site?.startsWith("https://")) return [site];
  return [
    ...new Set([site, "http://localhost:3000"].filter(Boolean)),
  ] as string[];
}

export function siteUrl(path = "") {
  const site = (process.env.SITE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return `${site}${path}`;
}

export function originAllowed(request: Request, allowed: string[]) {
  const origin = request.headers.get("Origin");
  return origin !== null && allowed.includes(origin);
}

export function corsHeaders(
  request: Request,
  allowed: string[],
  methods = "POST, OPTIONS",
): Record<string, string> {
  const origin = request.headers.get("Origin");
  if (!origin || !allowed.includes(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function preflight(request: Request, allowed: string[]) {
  if (!originAllowed(request, allowed)) {
    return new Response(null, { status: 403, headers: { Vary: "Origin" } });
  }
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, allowed),
  });
}

export function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export type BodyResult =
  | { ok: true; raw: string }
  | { ok: false; status: number; error: string };

/** The body as text, refusing anything over `maxBytes` even when Content-Length lies. */
export async function readBody(
  request: Request,
  maxBytes = DEFAULT_BODY_LIMIT,
): Promise<BodyResult> {
  const tooLarge = {
    ok: false,
    status: 413,
    error: "Request body is too large",
  } as const;
  if (Number(request.headers.get("Content-Length") ?? "0") > maxBytes) {
    return tooLarge;
  }
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > maxBytes) return tooLarge;
  return { ok: true, raw: new TextDecoder().decode(buffer) };
}

export type JsonResult =
  | { ok: true; raw: string; value: Record<string, unknown> }
  | { ok: false; status: number; error: string };

export async function readJson(
  request: Request,
  maxBytes = DEFAULT_BODY_LIMIT,
): Promise<JsonResult> {
  const body = await readBody(request, maxBytes);
  if (!body.ok) return body;
  return parseJsonObject(body.raw);
}

export function parseJsonObject(raw: string): JsonResult {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, status: 400, error: "Expected a JSON object" };
    }
    return { ok: true, raw, value: value as Record<string, unknown> };
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON" };
  }
}

export async function hmacSha256Hex(secret: string, data: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

/** Checks a hex HMAC-SHA256 signature of the raw body; a `sha256=` prefix is accepted. */
export async function verifyHmac(
  secret: string,
  raw: string,
  signature: string | null,
) {
  if (!signature) return false;
  const given = signature
    .trim()
    .replace(/^sha256=/i, "")
    .toLowerCase();
  return timingSafeEqual(await hmacSha256Hex(secret, raw), given);
}

/** First X-Forwarded-For hop, then X-Real-IP. Only trustworthy behind a proxy that overwrites them. */
export function clientIp(request: Request) {
  const forwarded = request.headers.get("X-Forwarded-For");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("X-Real-IP")?.trim() || "unknown";
}
