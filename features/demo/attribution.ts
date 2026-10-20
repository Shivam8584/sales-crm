import { LEAD_LIMITS, UTM_KEYS, type Utm } from "@/lib/domain/leads";

const STORAGE_KEY = "hypedrive.attribution";
const OWN_PARAMS = ["embed", "theme", "ref", "page"];

export type Attribution = {
  utm: Utm;
  referrer?: string;
  landingPage?: string;
};

function read(): Attribution | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Attribution) : null;
  } catch {
    return null;
  }
}

function write(value: Attribution) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {}
}

function clip(value: string | null | undefined, max: number) {
  return value?.trim().slice(0, max) || undefined;
}

/**
 * First-touch attribution for the browser session; a visit with new UTM
 * parameters replaces it. When embedded, the host page passes its own URL and
 * referrer as `page` and `ref`, since inside an iframe `document.referrer` is
 * the host page.
 */
export function captureAttribution(): Attribution {
  const params = new URLSearchParams(window.location.search);
  const utm: Utm = {};
  for (const key of UTM_KEYS) {
    const value = clip(params.get(`utm_${key}`), LEAD_LIMITS.utm);
    if (value) utm[key] = value;
  }
  const stored = read();
  if (stored && Object.keys(utm).length === 0) return stored;

  const landing = new URLSearchParams(params);
  for (const key of OWN_PARAMS) landing.delete(key);
  const query = landing.toString();
  const current: Attribution = {
    utm,
    referrer:
      clip(params.get("ref") ?? document.referrer, LEAD_LIMITS.meta) ??
      stored?.referrer,
    landingPage: clip(
      params.get("page") ??
        `${window.location.pathname}${query ? `?${query}` : ""}`,
      LEAD_LIMITS.meta,
    ),
  };
  write(current);
  return current;
}
