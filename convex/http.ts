import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { calcomWebhook, submit, submitPreflight } from "./leads";
import { webhook as platformWebhook } from "./platform";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({ path: "/leads", method: "POST", handler: submit });
http.route({ path: "/leads", method: "OPTIONS", handler: submitPreflight });
http.route({
  path: "/webhooks/calcom",
  method: "POST",
  handler: calcomWebhook,
});
http.route({
  path: "/webhooks/platform",
  method: "POST",
  handler: platformWebhook,
});

export default http;
