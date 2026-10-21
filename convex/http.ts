import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { chatwootWebhook, emailInbound } from "./inbound";
import { calcomWebhook, submit, submitPreflight } from "./leads";
import { webhook as platformWebhook } from "./platform";
import { reviewGap, reviewGapPreflight } from "./prospecting";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({ path: "/leads", method: "POST", handler: submit });
http.route({ path: "/leads", method: "OPTIONS", handler: submitPreflight });
http.route({ path: "/review-gap", method: "POST", handler: reviewGap });
http.route({
  path: "/review-gap",
  method: "OPTIONS",
  handler: reviewGapPreflight,
});
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
http.route({
  path: "/webhooks/email-inbound",
  method: "POST",
  handler: emailInbound,
});
http.route({
  path: "/webhooks/chatwoot",
  method: "POST",
  handler: chatwootWebhook,
});

export default http;
