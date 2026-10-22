export const FETCH_TIMEOUT_MS = 5_000;
export const MAX_REDIRECTS = 3;
export const MAX_BODY_BYTES = 500 * 1024;

export class Refused extends Error {}

export type RawResponse = { status: number; location?: string; body: string };
export type Requester = (url: URL, timeoutMs: number) => Promise<RawResponse>;

function ipv4(text: string) {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? +part : NaN));
  return octets.every((octet) => octet <= 255) ? octets : null;
}

function publicV4([a, b, c]: number[]) {
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  return !(a === 203 && b === 0 && c === 113);
}

function ipv6(text: string) {
  let host = text.replace(/^\[|\]$/g, "");
  host = host.split("%")[0];
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(host);
  if (tail) {
    const v4 = ipv4(tail[1]);
    if (!v4) return null;
    const hex = (hi: number, lo: number) => ((hi << 8) | lo).toString(16);
    host = `${host.slice(0, -tail[1].length)}${hex(v4[0], v4[1])}:${hex(v4[2], v4[3])}`;
  }
  const halves = host.split("::");
  if (halves.length > 2) return null;
  const read = (part: string) => (part ? part.split(":") : []);
  const head = read(halves[0]);
  const rest = halves.length === 2 ? read(halves[1]) : [];
  const fill = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : fill < 1) return null;
  const groups = [
    ...head,
    ...Array<string>(fill > 0 ? fill : 0).fill("0"),
    ...rest,
  ];
  const numbers = groups.map((group) =>
    /^[\da-f]{1,4}$/i.test(group) ? parseInt(group, 16) : NaN,
  );
  return numbers.length === 8 && numbers.every((n) => !Number.isNaN(n))
    ? numbers
    : null;
}

function publicV6(groups: number[]) {
  const [first, second, third] = groups;
  // Only global unicast (2000::/3) is allowed, which also rules out loopback,
  // unique-local, link-local, multicast and v4-mapped or NAT64 forms.
  if ((first & 0xe000) !== 0x2000) return false;
  if (first === 0x2001 && (second === 0x0db8 || second === 0)) return false;
  if (first === 0x2002) {
    return publicV4([second >> 8, second & 255, third >> 8]);
  }
  return true;
}

/** True when the address can only be a public internet host. */
export function isPublicIp(address: string) {
  const v4 = ipv4(address);
  if (v4) return publicV4(v4);
  const v6 = address.includes(":") ? ipv6(address) : null;
  return v6 ? publicV6(v6) : false;
}

const INTERNAL_SUFFIXES = [
  "localhost",
  "local",
  "localdomain",
  "internal",
  "lan",
  "home",
  "home.arpa",
  "corp",
  "intranet",
  "svc",
];

/** A hostname (or IP literal) that could be a public website. Names are checked again at connect time. */
export function isPublicHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return false;
  if (host.startsWith("[") || host.includes(":")) return isPublicIp(host);
  if (/^[\d.]+$/.test(host)) return isPublicIp(host);
  if (!host.includes(".")) return false;
  if (
    !host
      .split(".")
      .every((label) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label))
  ) {
    return false;
  }
  if (/^\d+$/.test(host.slice(host.lastIndexOf(".") + 1))) return false;
  return !INTERNAL_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

/** Parses a URL we are willing to request: https, default port, no credentials, public host. */
export function fetchableUrl(input: string | URL, base?: string | URL) {
  let url: URL;
  try {
    url = new URL(input, base);
  } catch {
    throw new Refused("That isn't a valid web address");
  }
  if (url.protocol !== "https:")
    throw new Refused("Only https sites are fetched");
  if (url.username || url.password)
    throw new Refused("Addresses with logins are not fetched");
  if (url.port && url.port !== "443")
    throw new Refused("Only the standard https port is fetched");
  if (!isPublicHost(url.hostname))
    throw new Refused("That address isn't a public website");
  return url;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/** Follows up to three redirects, checking every hop, within one overall time limit. */
export async function fetchPage(
  start: string,
  request: Requester,
  options: { timeoutMs?: number; now?: () => number } = {},
) {
  const now = options.now ?? Date.now;
  const deadline = now() + (options.timeoutMs ?? FETCH_TIMEOUT_MS);
  let url = fetchableUrl(start);
  for (let hop = 0; ; hop++) {
    const remaining = deadline - now();
    if (remaining <= 0)
      throw new Refused("The website took too long to answer");
    const response = await request(url, remaining);
    if (REDIRECTS.has(response.status)) {
      if (!response.location)
        throw new Refused("The website redirected nowhere");
      if (hop >= MAX_REDIRECTS)
        throw new Refused("The website redirected too many times");
      url = fetchableUrl(response.location, url);
      continue;
    }
    if (response.status < 200 || response.status > 299) {
      throw new Refused(`The website answered HTTP ${response.status}`);
    }
    return { url: url.href, html: response.body };
  }
}
