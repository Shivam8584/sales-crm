"use client";

import { useState } from "react";

/** Keeps the last result on screen while a query reloads for new arguments. */
export function useLatest<T>(live: T | undefined) {
  const [stale, setStale] = useState<T>();
  if (live !== undefined && live !== stale) setStale(live);
  return { data: live ?? stale, loading: live === undefined };
}
