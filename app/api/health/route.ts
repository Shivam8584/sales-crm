const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

/** Uptime probe: 200 when the app is up and Convex answers a query, else 503. */
export async function GET() {
  const started = Date.now();
  let convex = false;
  try {
    const response = await fetch(`${CONVEX_URL}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "auth:methods", args: {}, format: "json" }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    convex = response.ok && (await response.json()).status === "success";
  } catch {}
  return Response.json(
    { ok: convex, convex, latencyMs: Date.now() - started },
    {
      status: convex ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
