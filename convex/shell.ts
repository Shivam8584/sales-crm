import { memberQuery } from "./lib/functions";
import { vDay } from "./lib/validators";

const CAP = 100;

/** Sidebar counts: live accounts, new leads, my overdue tasks, my unread notifications. */
export const navCounts = memberQuery({
  args: { today: vDay },
  handler: async (ctx, { today }) => {
    const me = ctx.viewer._id;
    const [accounts, newLeads, todo, inProgress, unread] = await Promise.all([
      ctx.db.query("accounts").collect(),
      ctx.db
        .query("leads")
        .withIndex("by_status", (q) => q.eq("status", "new"))
        .take(CAP),
      ctx.db
        .query("tasks")
        .withIndex("by_assignee_status_completed", (q) =>
          q.eq("assigneeId", me).eq("status", "todo"),
        )
        .collect(),
      ctx.db
        .query("tasks")
        .withIndex("by_assignee_status_completed", (q) =>
          q.eq("assigneeId", me).eq("status", "in_progress"),
        )
        .collect(),
      ctx.db
        .query("notifications")
        .withIndex("by_recipient", (q) =>
          q.eq("recipientId", me).eq("readAt", undefined),
        )
        .take(CAP),
    ]);
    return {
      accounts: accounts.filter((account) => !account.archivedAt).length,
      leads: newLeads.length,
      tasks: [...todo, ...inProgress].filter(
        (task) => task.dueDate !== undefined && task.dueDate < today,
      ).length,
      inbox: unread.length,
    };
  },
});
