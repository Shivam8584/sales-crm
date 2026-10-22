"use client";

import { useSyncExternalStore } from "react";

export type RecentRecord = {
  type: "account" | "person" | "lead" | "deal";
  id: string;
};

const KEY = "recent-records";
const LIMIT = 8;
const EMPTY: RecentRecord[] = [];
const TYPES: Record<string, RecentRecord["type"]> = {
  accounts: "account",
  people: "person",
  leads: "lead",
  deals: "deal",
};
const listeners = new Set<() => void>();
let cached: { raw: string | null; list: RecentRecord[] } = {
  raw: null,
  list: EMPTY,
};

function read() {
  const raw = localStorage.getItem(KEY);
  if (raw !== cached.raw) {
    let list = EMPTY;
    try {
      list = raw ? (JSON.parse(raw) as RecentRecord[]) : EMPTY;
    } catch {}
    cached = { raw, list };
  }
  return cached.list;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** The record a path like `/records/accounts/<id>` shows, if any. */
export function recordAt(pathname: string): RecentRecord | null {
  const match = /^\/(accounts|people|leads|deals)\/([^/]+)$/.exec(pathname);
  return match ? { type: TYPES[match[1]], id: match[2] } : null;
}

export function rememberRecord(record: RecentRecord) {
  const next = [
    record,
    ...read().filter(
      (item) => item.type !== record.type || item.id !== record.id,
    ),
  ].slice(0, LIMIT);
  localStorage.setItem(KEY, JSON.stringify(next));
  for (const listener of listeners) listener();
}

/** Records this browser opened recently, most recent first. */
export function useRecentRecords() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
