import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly("activation checks", { minuteUTC: 0 }, internal.activation.check);

export default crons;
