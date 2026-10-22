/** Whole minutes for the log; calls under 15 seconds log no duration. */
export function callMinutes(seconds: number) {
  return seconds < 15 ? 0 : Math.max(1, Math.round(seconds / 60));
}
