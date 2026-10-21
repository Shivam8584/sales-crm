/**
 * Demo contacts live on reserved names (RFC 2606 `.example`) and the unallocated
 * +91 0 range, so automations run against demo data can never reach a real person.
 */
export function demoEmail(local: string, domain: string) {
  const name = domain.replace(/^https?:\/\/(www\.)?/, "").split(".")[0];
  return `${local.toLowerCase()}@${name || "demo"}.example`;
}

/** `+91 00000 12345`-style numbers; `n` keeps them distinct for identity matching. */
export function demoPhone(n: number) {
  return `+910000${String(n).padStart(6, "0")}`;
}
