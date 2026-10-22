import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly(
  "activation checks",
  { minuteUTC: 0 },
  internal.activation.check,
  {},
);
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
crons.cron("daily digest", "30 3 * * 1-5", internal.digest.sendDigests);

export default crons;
