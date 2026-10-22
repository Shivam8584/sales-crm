import { normalizePhone } from "../../../lib/domain/normalize";
import {
  DIN_PATTERN,
  SOURCES,
  callKyc,
  clean,
  gstCandidates,
  isRegistryRecord,
  providerMode,
  sandboxDin,
  sandboxGst,
  type DinResult,
  type GstResult,
} from "./kyc";
import { brandName } from "./html";
import {
  DEFAULT_ORDER,
  ProviderFailure,
  parseOrder,
  type Field,
  type Found,
  type PageMeta,
  type Provider,
} from "./waterfall";

const REGISTRY = 1;
const CONTACT = 0.7;

const GST_FIELDS: Field[] = [
  "gstin",
  "panRoot",
  "legalName",
  "tradeName",
  "gstStatus",
  "businessType",
  "registrationDate",
  "address",
  "city",
  "state",
  "pinCode",
  "phone",
  "email",
  "name",
];

const gst: Provider = {
  id: "gst",
  label: "GST registry",
  fields: GST_FIELDS,
  isConfigured: (env) => providerMode(env) !== null,
  needs: (input) => (input.gstin ? null : "No GSTIN on the account"),
  async lookup(input, { env }) {
    const gstin = input.gstin!;
    const sandbox = providerMode(env) === "sandbox";
    const reply = sandbox
      ? sandboxGst(gstin)
      : await callKyc<GstResult>(env, "/v1/verify/gst", { gstin });
    if (!reply.ok) throw new ProviderFailure(reply.error);
    if (!isRegistryRecord(reply.data))
      throw new ProviderFailure("GSTIN not found");
    const source = sandbox ? SOURCES.gstSandbox : SOURCES.gst;
    const fetchedAt = Date.now();
    const values: Partial<Record<Field, Found>> = {};
    for (const item of gstCandidates(gstin, reply.data)) {
      values[item.field as Field] = {
        value: item.value,
        confidence: item.strength === "authoritative" ? REGISTRY : CONTACT,
        source,
        fetchedAt,
      };
    }
    return { values, evidence: reply.evidence };
  },
};

const din: Provider = {
  id: "din",
  label: "MCA director registry",
  fields: ["phone"],
  isConfigured: (env) => providerMode(env) !== null,
  needs: (input) =>
    input.din && DIN_PATTERN.test(input.din) ? null : "No valid DIN",
  async lookup(input, { env }) {
    const number = input.din!;
    const sandbox = providerMode(env) === "sandbox";
    const reply = sandbox
      ? sandboxDin(number)
      : await callKyc<DinResult>(env, "/v1/verify/din", { din: number });
    if (!reply.ok) throw new ProviderFailure(reply.error);
    if (!reply.data?.isValid) throw new ProviderFailure("DIN not found");
    const raw = clean(reply.data.phoneNumber);
    if (!raw) {
      throw new ProviderFailure("No phone number is registered for this DIN");
    }
    return {
      values: {
        phone: {
          value: normalizePhone(raw) ?? raw,
          confidence: CONTACT,
          source: sandbox ? SOURCES.dinSandbox : SOURCES.din,
          fetchedAt: Date.now(),
        },
      },
      evidence: reply.evidence,
    };
  },
};

const platform: Provider = {
  id: "platform",
  label: "Hypedrive platform",
  fields: ["legalName"],
  isConfigured: () => true,
  needs: (input) =>
    input.platform?.legalName ? null : "The platform has no legal name for it",
  async lookup(input) {
    return {
      values: {
        legalName: {
          value: input.platform!.legalName!,
          confidence: 0.85,
          source: "platform",
          fetchedAt: Date.now(),
        },
      },
      evidence:
        "Legal name sent by the Hypedrive platform when the organisation was created.",
    };
  },
};

function sandboxPage(domain: string): PageMeta {
  const label = domain.replace(/^www\./, "").split(".")[0];
  const brand = label.charAt(0).toUpperCase() + label.slice(1);
  return {
    url: `https://${domain}/`,
    title: `${brand} | Official store`,
    siteName: brand,
    description: `Sandbox description for ${domain}.`,
    gstins: domain === "kesarleaf.in" ? ["10BSDPG0911J1ZG"] : [],
  };
}

const website: Provider = {
  id: "website",
  label: "Company website",
  fields: ["name", "siteDescription", "gstin"],
  isConfigured: () => true,
  needs: (input) => (input.domain ? null : "No website on the account"),
  async lookup(input, { env, homepage }) {
    const domain = input.domain!;
    const sandbox = providerMode(env) === "sandbox";
    let page: PageMeta;
    if (sandbox) {
      page = sandboxPage(domain);
    } else {
      const reply = await homepage(`https://${domain}/`);
      if (!reply.ok) throw new ProviderFailure(reply.error);
      page = reply.page;
    }
    const source = sandbox ? "website:sandbox" : "website";
    const url = page.canonical ?? page.url;
    const fetchedAt = Date.now();
    const values: Partial<Record<Field, Found>> = {};
    const brand = brandName(page, domain);
    if (brand) {
      values.name = {
        value: brand.name,
        confidence: brand.confidence,
        source,
        url,
        fetchedAt,
      };
    }
    if (page.description) {
      values.siteDescription = {
        value: page.description,
        confidence: 0.9,
        source,
        url,
        fetchedAt,
      };
    }
    if (page.gstins[0]) {
      values.gstin = {
        value: page.gstins[0],
        confidence: 0.7,
        source,
        url,
        fetchedAt,
      };
    }
    return {
      values,
      evidence: sandbox
        ? "Test data from the enrichment sandbox, not read from the website."
        : `Read from the page at ${page.url} (title, meta tags and any GSTIN printed on it).`,
    };
  },
};

export const PROVIDERS = { gst, din, platform, website } as const;
export type ProviderId = keyof typeof PROVIDERS;

/** Account lookups in order; ENRICHMENT_ORDER (comma-separated ids) overrides it. */
export function accountChain(env: Record<string, string | undefined>) {
  const ids = parseOrder(env.ENRICHMENT_ORDER, DEFAULT_ORDER);
  return ids.map((id) => PROVIDERS[id as ProviderId]);
}

/** What an account lookup tries to fill before it stops. */
export const ACCOUNT_WANTED: Field[] = [
  "gstin",
  "legalName",
  "gstStatus",
  "state",
  "registrationDate",
  "siteDescription",
];
