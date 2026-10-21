import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly("activation checks", { minuteUTC: 0 }, internal.activation.check);
crons.daily(
  "platform sync",
  { hourUTC: 21, minuteUTC: 30 },
  internal.platformSync.syncAll,
);

export default crons;
