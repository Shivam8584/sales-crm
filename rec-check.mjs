import { ConvexHttpClient } from "convex/browser";
import { anyApi as api } from "convex/server";
const client = new ConvexHttpClient("http://127.0.0.1:3210");
const r = await client.action(api.auth.signIn, {
  provider: "password",
  params: { email: "shivam@hypedrive.in", password: "crm-ccb55666", flow: "signIn" },
});
client.setAuth(r.tokens.token);
const list = await client.query(api.accounts.list, { includeArchived: true });
const stats = await client.query(api.accounts.listStats, {});
const byId = new Map(stats.map((s) => [s.accountId, s]));
for (const a of list) {
  const s = byId.get(a._id);
  console.log(
    a.name.padEnd(20),
    a.stage.padEnd(13),
    a.archivedAt ? "ARCH" : "    ",
    "deals", s.openDeals,
    JSON.stringify(s.pipeline),
    "plat", s.onPlatform, "stuck", s.stuck,
    "trend", s.trend.join(""),
    "last", s.lastInteraction ? `${new Date(s.lastInteraction.at).toISOString().slice(0, 10)} ${s.lastInteraction.kind} ${s.lastInteraction.subject ?? ""}` : "-",
  );
}
const first = list[0];
for (const days of [7, 30, 90]) {
  console.log(first.name, days, JSON.stringify(await client.query(api.timeline.activity, { target: { accountId: first._id }, days })));
}
const ps = await client.query(api.people.listStats, {});
console.log("people stats", ps.length, ps.slice(0, 3).map((p) => p.trend.join("") + " " + JSON.stringify(p.lastInteraction)));
