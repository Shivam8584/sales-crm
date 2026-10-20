import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { LEAD_KIND_LABEL } from "../lib/domain/labels";
import { formatPhone } from "../lib/domain/normalize";
import { siteUrl } from "./lib/http";
import { leadChannel, leadHref } from "./lib/leads";

const TIMEOUT_MS = 8000;

const EVENT_LABEL = {
  lead_new: "New lead",
  lead_sla: "No first touch within the SLA",
  demo_booked: "Demo booked",
  demo_rescheduled: "Demo rescheduled",
  demo_cancelled: "Demo cancelled",
} as const;

const vEvent = v.union(
  v.literal("lead_new"),
  v.literal("lead_sla"),
  v.literal("demo_booked"),
  v.literal("demo_rescheduled"),
  v.literal("demo_cancelled"),
);

async function post(url: string, body: unknown, label: string) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(
        `${label} alert failed: ${response.status} ${(await response.text()).slice(0, 300)}`,
      );
    }
  } catch (error) {
    console.error(
      `${label} alert failed:`,
      error instanceof Error ? `${error.name}: ${error.message}` : error,
    );
  }
}

function escape(value: string) {
  return value.replace(/[&<>]/g, (char) =>
    char === "&" ? "&amp;" : char === "<" ? "&lt;" : "&gt;",
  );
}

const IST = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

/** Posts a lead event to Slack and/or a generic webhook; a no-op when neither is configured. */
export const send = internalAction({
  args: { event: vEvent, leadId: v.id("leads") },
  handler: async (ctx, { event, leadId }) => {
    const slackUrl = process.env.ALERT_SLACK_WEBHOOK_URL;
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;
    if (!slackUrl && !webhookUrl) return;

    const lead = await ctx.runQuery(internal.leads.forAlert, { id: leadId });
    if (!lead) return;
    const url = siteUrl(leadHref(lead._id));
    const label = EVENT_LABEL[event];
    const owner = lead.owner?.name ?? "Unassigned";
    const channel = leadChannel(lead);
    const contact = [lead.email, lead.phone && formatPhone(lead.phone)]
      .filter(Boolean)
      .join(" · ");
    const jobs: Promise<void>[] = [];

    if (slackUrl) {
      const fields = [
        `*Lead*\n${escape(lead.name)}`,
        `*Company*\n${escape(lead.companyName)}`,
        `*Source*\n${escape(lead.utm.campaign ? `${channel} (${lead.utm.campaign})` : channel)}`,
        `*Owner*\n${escape(owner)}`,
      ];
      if (contact) fields.push(`*Contact*\n${escape(contact)}`);
      if (lead.demoAt && event !== "demo_cancelled") {
        fields.push(`*Demo*\n${IST.format(lead.demoAt)} IST`);
      }
      jobs.push(
        post(
          slackUrl,
          {
            text: `${label}: ${lead.name} (${lead.companyName})`,
            blocks: [
              {
                type: "header",
                text: {
                  type: "plain_text",
                  text: `${label}: ${lead.name}`.slice(0, 150),
                },
              },
              {
                type: "section",
                fields: fields.map((text) => ({ type: "mrkdwn", text })),
              },
              {
                type: "context",
                elements: [
                  {
                    type: "mrkdwn",
                    text: escape(
                      [LEAD_KIND_LABEL[lead.kind], lead.landingPage]
                        .filter(Boolean)
                        .join(" · "),
                    ),
                  },
                ],
              },
              {
                type: "actions",
                elements: [
                  {
                    type: "button",
                    text: { type: "plain_text", text: "Open in CRM" },
                    url,
                  },
                ],
              },
            ],
          },
          "Slack",
        ),
      );
    }
    if (webhookUrl) {
      jobs.push(
        post(
          webhookUrl,
          {
            event,
            url,
            lead: {
              id: lead._id,
              kind: lead.kind,
              name: lead.name,
              email: lead.email ?? null,
              phone: lead.phone ?? null,
              companyName: lead.companyName,
              website: lead.website ?? null,
              source: lead.source,
              utm: lead.utm,
              referrer: lead.referrer ?? null,
              landingPage: lead.landingPage ?? null,
              status: lead.status,
              createdAt: lead._creationTime,
              demoAt: lead.demoAt ?? null,
              slaBreachedAt: lead.slaBreachedAt ?? null,
            },
            owner: lead.owner,
          },
          "Webhook",
        ),
      );
    }
    await Promise.all(jobs);
  },
});
