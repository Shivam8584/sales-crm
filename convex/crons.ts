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
crons.daily(
  "orphan uploads",
  { hourUTC: 20, minuteUTC: 0 },
  internal.files.sweepOrphans,
  {},
);
crons.daily(
  "account embeddings",
  { hourUTC: 20, minuteUTC: 30 },
  internal.aiEmbeddings.embedStale,
  {},
);
crons.daily("mcp call log", { hourUTC: 21, minuteUTC: 0 }, internal.mcp.trim, {});
crons.cron("daily digest", "30 3 * * 1-5", internal.digest.sendDigests);
crons.cron("weekly manager report", "0 4 * * 1", internal.weekly.send);

export default crons;
