const TRUSTED_SERVER = /(^|\.)cloudflare\.net$/i;

const domainOf = (value) =>
  (value ?? "")
    .replace(/^[<"'\s]+|[>"'\s]+$/g, "")
    .split("@")
    .pop()
    .toLowerCase();

const aligned = (domain, from) =>
  Boolean(domain) &&
  (domain === from ||
    from.endsWith(`.${domain}`) ||
    domain.endsWith(`.${from}`));

function resultsPass(value, from) {
  const [server, ...parts] = value
    .replace(/^\s*i=\d+\s*;/i, "")
    .split(";")
    .map((part) => part.trim());
  if (!TRUSTED_SERVER.test(server.split(/\s/)[0])) return false;
  return parts.some((part) => {
    if (/^dkim=pass\b/i.test(part)) {
      return aligned(
        /header\.d=([^\s;]+)/i.exec(part)?.[1]?.toLowerCase(),
        from,
      );
    }
    if (/^spf=pass\b/i.test(part)) {
      return aligned(
        domainOf(/smtp\.mailfrom=([^\s;]+)/i.exec(part)?.[1]),
        from,
      );
    }
    return false;
  });
}

function spfPass(value, from) {
  if (!/^\s*pass\b/i.test(value)) return false;
  const receiver = /receiver=([^\s;]+)/i.exec(value)?.[1] ?? "";
  if (!TRUSTED_SERVER.test(receiver)) return false;
  return aligned(domainOf(/envelope-from=([^\s;]+)/i.exec(value)?.[1]), from);
}

/**
 * True only when the receiving server's own verdict is a pass for the From
 * domain. Only the topmost copy of each header counts: the receiver prepends
 * its headers, while anything the sender forged sits below them.
 */
export function isAuthenticated(headers, fromDomain) {
  const from = (fromDomain ?? "").toLowerCase();
  if (!from) return false;
  const top = (name) => headers?.find((header) => header.key === name)?.value;
  const results = top("authentication-results");
  const arc = top("arc-authentication-results");
  const spf = top("received-spf");
  return (
    (typeof results === "string" && resultsPass(results, from)) ||
    (typeof arc === "string" && resultsPass(arc, from)) ||
    (typeof spf === "string" && spfPass(spf, from))
  );
}
