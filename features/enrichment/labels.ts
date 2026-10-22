import { sourceFamily } from "@/convex/lib/enrichment/kyc";
import { confidenceBand } from "@/convex/lib/enrichment/waterfall";
import { AGENT_SOURCES } from "@/lib/domain/research";

const FACT_LABEL: Record<string, string> = {
  gstin: "GSTIN",
  panRoot: "PAN",
  name: "Account name",
  legalName: "Legal name",
  tradeName: "Trade name",
  gstStatus: "GST status",
  businessType: "Constitution",
  registrationDate: "Registered",
  address: "Address",
  city: "City",
  state: "State",
  pinCode: "PIN code",
  phone: "Phone",
  email: "Email",
  siteDescription: "Website description",
  title: "Title",
  linkedinUrl: "LinkedIn",
  domain: "Website",
  employment: "Employment",
};

export function factLabel(field: string) {
  return FACT_LABEL[field] ?? field;
}

export function isSandboxSource(source: string) {
  return source.endsWith(":sandbox");
}

export function sourceLabel(source: string) {
  switch (sourceFamily(source)) {
    case "gst":
      return "GST registry";
    case "din":
      return "MCA director registry";
    case "platform":
      return "Hypedrive platform";
    case "website":
      return "Company website";
    case "email":
      return "Their emails";
    case "note":
      return "Team notes";
    case "contacts":
      return "Contact emails";
    default:
      return source;
  }
}

/** "From the GST registry · high confidence"; the confidence is absent on older facts. */
export function sourceNote(source: string, confidence: number | null) {
  const name = sourceLabel(source);
  const family = sourceFamily(source);
  const from = family === "website" ? name.toLowerCase() : name;
  return [
    AGENT_SOURCES.some((own) => own === family)
      ? `From ${name.toLowerCase()}`
      : `From the ${from}`,
    confidence === null ? null : bandLabel(confidence),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function bandLabel(confidence: number) {
  return `${confidenceBand(confidence)} confidence`;
}

/** One line per provider a lookup tried, in the order it tried them. */
export function attemptLines(
  attempts: { provider: string; status: string; ms: number; note?: string }[],
) {
  return attempts
    .map((item) =>
      [
        `${sourceLabel(item.provider)}: ${item.status}`,
        item.note,
        item.status === "skipped" ? null : `${item.ms} ms`,
      ]
        .filter(Boolean)
        .join(" · "),
    )
    .join("\n");
}

export function isInactiveGstStatus(status: string) {
  return /cancel|inactive|suspend|revok/i.test(status);
}

const REGISTRY_DATE = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Registry dates arrive as `YYYY-MM-DD` or `DD/MM/YYYY`; anything else is shown as sent. */
export function formatRegistryDate(value: string) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const indian = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(value);
  const parts = iso
    ? [iso[1], iso[2], iso[3]]
    : indian
      ? [indian[3], indian[2], indian[1]]
      : null;
  if (!parts) return value;
  const date = new Date(`${parts.join("-")}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : REGISTRY_DATE.format(date);
}

export function maskDin(din: string) {
  return `••••${din.slice(-4)}`;
}

/** The identifier a run looked up, read back from the evidence it stored. */
export function requestedValue(evidence: string, key: "din" | "gstin") {
  try {
    const value = (
      JSON.parse(evidence) as { request?: Record<string, unknown> }
    ).request?.[key];
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}
