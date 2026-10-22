import { afterEach, beforeEach, vi } from "vitest";

// Scheduled functions (merge steps, SLA timers) then only run when a test asks for them.
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});
