import type { Period } from "@/convex/lib/reports";

export const PERIOD_LABEL: Record<Period, { short: string; long: string }> = {
  "7d": { short: "7D", long: "Last 7 days" },
  "30d": { short: "30D", long: "Last 30 days" },
  "90d": { short: "90D", long: "Last 90 days" },
  quarter: { short: "Quarter", long: "This quarter" },
};
