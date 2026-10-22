import { internalQuery, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { istToday } from "../lib/domain/day";
import { deliver, emailProvider } from "./lib/automations/delivery";
import { siteUrl } from "./lib/http";
import { routes } from "../lib/routes";

const LISTED = 5;
const SCAN = 100;

export const gather = internalQuery({
  args: {},
  handler: async (ctx) => {
    const today = istToday();
    const members = await ctx.db
      .query("members")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(200);
    const digests = [];
    for (const member of members) {
      if (member.digestOff === true) continue;

      const unread = await ctx.db
        .query("notifications")
        .withIndex("by_recipient", (q) =>
          q.eq("recipientId", member._id).eq("readAt", undefined),
        )
        .order("desc")
        .take(SCAN);

      let tasks = 0;
      for (const status of ["todo", "in_progress"] as const) {
        const open = await ctx.db
          .query("tasks")
          .withIndex("by_assignee_status_completed", (q) =>
            q.eq("assigneeId", member._id).eq("status", status),
          )
          .take(SCAN);
        tasks += open.filter(
          (task) => task.dueDate !== undefined && task.dueDate <= today,
        ).length;
      }

      const leads = (
        await ctx.db
          .query("leads")
          .withIndex("by_owner_status", (q) =>
            q.eq("ownerId", member._id).eq("status", "new"),
          )
          .take(SCAN)
      ).length;

      if (unread.length + tasks + leads === 0) continue;
      digests.push({
        memberId: member._id,
        name: member.name,
        email: member.email,
        unread: unread.length,
        titles: unread
          .slice(0, LISTED)
          .map((item) => ({ title: item.title, href: item.href ?? routes.inbox })),
        tasks,
        leads,
      });
    }
    return digests;
  },
});

const plural = (n: number, one: string, many: string) =>
  `${n >= SCAN ? `${SCAN}+` : n} ${n === 1 ? one : many}`;

export const sendDigests = internalAction({
  args: {},
  handler: async (ctx) => {
    try {
      const { provider, problem } = emailProvider();
      if (provider === "outbox") {
        console.log(
          `Daily digest skipped: no email provider${problem ? ` (${problem})` : ""}`,
        );
        return;
      }
      const day = istToday();
      for (const digest of await ctx.runQuery(internal.digest.gather, {})) {
        const lines: string[] = [];
        if (digest.tasks > 0) {
          lines.push(
            `${plural(digest.tasks, "task", "tasks")} due today or overdue`,
            siteUrl(`${routes.tasks}?view=list`),
            "",
          );
        }
        if (digest.leads > 0) {
          lines.push(
            `${plural(digest.leads, "new lead", "new leads")} waiting for a first touch`,
            siteUrl(`${routes.leads}?owner=mine`),
            "",
          );
        }
        if (digest.unread > 0) {
          lines.push(
            `${plural(digest.unread, "unread notification", "unread notifications")}`,
          );
          for (const item of digest.titles) {
            lines.push(`- ${item.title}: ${siteUrl(item.href)}`);
          }
          lines.push("");
        }
        const total = digest.tasks + digest.leads + digest.unread;
        const result = await deliver(ctx, {
          channel: "email",
          provider,
          stepKey: `digest-${digest.memberId}-${day}`,
          recipientId: digest.memberId,
          to: digest.email,
          subject: `Your day at Hypedrive: ${total === 1 ? "1 thing needs" : `${total} things need`} you`,
          body: [
            `Hi ${digest.name.split(" ")[0]},`,
            "",
            ...lines,
            "Turn off this digest in Settings → Profile.",
          ].join("\n"),
        });
        if (!result.ok)
          console.error(`Digest to ${digest.memberId} failed: ${result.error}`);
      }
    } catch (error) {
      console.error("Daily digest failed:", error);
    }
  },
});
