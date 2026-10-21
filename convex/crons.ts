import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly("activation checks", { minuteUTC: 0 }, internal.activation.check);
crons.daily(
  "platform sync",
  { hourUTC: 21, minuteUTC: 30 },
  internal.platformSync.syncAll,
);
crons.daily(
  "marketplace snapshots",
  { hourUTC: 22, minuteUTC: 0 },
  internal.prospecting.refreshAll,
);
crons.daily(
  "notification digest",
  { hourUTC: 3, minuteUTC: 30 },
  internal.notifications.sendDigests,
);

export default crons;
