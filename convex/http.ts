import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { exotelWebhook } from "./calls";
import { chatwootWebhook, emailInbound } from "./inbound";
import { callback as googleCallback } from "./google";
import { calcomWebhook, submit, submitPreflight } from "./leads";
import { endpoint as mcpEndpoint, methodNotAllowed as mcpGet } from "./mcp";
import { webhook as platformWebhook } from "./platform";
import { reviewGap, reviewGapPreflight } from "./prospecting";
import { surveyInfo, surveyPreflight, surveyRespond } from "./surveys";

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
http.route({
  path: "/webhooks/exotel",
  method: "POST",
  handler: exotelWebhook,
});
http.route({ path: "/survey/info", method: "GET", handler: surveyInfo });
http.route({ path: "/survey/respond", method: "POST", handler: surveyRespond });
http.route({
  path: "/survey/respond",
  method: "OPTIONS",
  handler: surveyPreflight,
});
http.route({
  path: "/google/callback",
  method: "GET",
  handler: googleCallback,
});
http.route({ path: "/mcp", method: "POST", handler: mcpEndpoint });
http.route({ path: "/mcp", method: "GET", handler: mcpGet });

export default http;
