import { ConvexHttpClient } from "convex/browser";
import { anyApi as api } from "convex/server";
const client = new ConvexHttpClient("http://127.0.0.1:3210");
const r = await client.action(api.auth.signIn, { provider: "password", params: { email: "shivam@hypedrive.in", password: "crm-ccb55666", flow: "signIn" } });
client.setAuth(r.tokens.token);
for (const a of await client.query(api.accounts.list, {})) console.log(a._id, a.name);
for (const p of (await client.query(api.people.list, {})).slice(0, 4)) console.log(p._id, p.firstName, p.lastName);
