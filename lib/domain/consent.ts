/**
 * Consent ledger vocabulary and the pure rules that turn a person's
 * append-only consent events into a contact decision. Shared by the Convex
 * gate (`canContact`) and the UI so both explain a block the same way.
 */
import type { Channel } from "./enums";
import { LEAD_SOURCE_LABEL } from "./leads";

export const CONSENT_EVENTS = [
  "grant",
  "withdraw",
  "dnd_on",
  "dnd_off",
  "erasure_requested",
  "erasure_cancelled",
  "erased",
] as const;
export type ConsentEvent = (typeof CONSENT_EVENTS)[number];

export const LAWFUL_BASES = [
  "consent",
  "legitimate_interest",
  "contract",
] as const;
export type LawfulBasis = (typeof LAWFUL_BASES)[number];

export const CONSENT_PURPOSES = ["sales_outreach", "product_updates"] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

/** How a rep heard it, for events recorded by hand. */
export const CONSENT_SOURCES = [
  "call",
  "email",
  "meeting",
  "whatsapp",
  "written",
  "other",
] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

export const CONSENT_CHANNEL_LABEL: Record<Channel, string> = {
  email: "Email",
  phone: "Phone",
  whatsapp: "WhatsApp",
};

export const CONSENT_EVENT_LABEL: Record<ConsentEvent, string> = {
  grant: "Granted",
  withdraw: "Withdrawn",
  dnd_on: "Marked DND",
  dnd_off: "DND cleared",
  erasure_requested: "Erasure requested",
  erasure_cancelled: "Erasure request dismissed",
  erased: "Personal data erased",
};

export const LAWFUL_BASIS_LABEL: Record<LawfulBasis, string> = {
  consent: "Consent",
  legitimate_interest: "Legitimate interest",
  contract: "Contract",
};

export const LAWFUL_BASIS_HINT: Record<LawfulBasis, string> = {
  consent: "They said yes to being contacted for this purpose.",
  legitimate_interest:
    "A reasonable business reason without asking first. Not enough for WhatsApp.",
  contract: "Needed to deliver something they signed up or pay for.",
};

export const CONSENT_PURPOSE_LABEL: Record<ConsentPurpose, string> = {
  sales_outreach: "Sales outreach",
  product_updates: "Product updates",
};

export const CONSENT_SOURCE_LABEL: Record<ConsentSource, string> = {
  call: "Phone call",
  email: "Email",
  meeting: "Meeting",
  whatsapp: "WhatsApp",
  written: "Written form",
  other: "Other",
};

export function consentSourceLabel(source: string) {
  return (
    CONSENT_SOURCE_LABEL[source as ConsentSource] ??
    LEAD_SOURCE_LABEL[source] ??
    source
  );
}

export const DEFAULT_RETENTION_DAYS = 180;
export const RETENTION_DAYS = { min: 30, max: 1095 } as const;
export const MAX_EVIDENCE = 500;
/** Typed by an admin to confirm an erasure. */
export const ERASE_CONFIRMATION = "erase";
export const ERASED_NAME = "Erased person";
export const REDACTED = "[redacted]";

/** The fields of a `consents` row the rules read. */
export type LedgerRow = {
  channel: Channel;
  granted: boolean;
  event?: ConsentEvent;
  basis?: LawfulBasis;
  purpose?: ConsentPurpose;
  recordedAt: number;
  _creationTime?: number;
};

/** Rows written before the ledger had event types: a demo-form tick is consent to sales outreach. */
export function eventOf(row: LedgerRow): ConsentEvent {
  return row.event ?? (row.granted ? "grant" : "withdraw");
}

export function purposeOf(row: LedgerRow): ConsentPurpose | null {
  if (row.event) return row.purpose ?? null;
  return row.granted ? "sales_outreach" : null;
}

export function basisOf(row: LedgerRow): LawfulBasis | null {
  return eventOf(row) === "grant" ? (row.basis ?? "consent") : null;
}

/** Oldest first; ties keep insertion order. */
export function chronological<T extends LedgerRow>(rows: T[]) {
  return [...rows].sort(
    (a, b) =>
      a.recordedAt - b.recordedAt ||
      (a._creationTime ?? 0) - (b._creationTime ?? 0),
  );
}

export type PurposeState = {
  status: "granted" | "withdrawn" | "none";
  basis: LawfulBasis | null;
  at: number | null;
};

export type ErasureState = {
  status: "none" | "requested" | "erased";
  at: number | null;
};

export type ChannelState = {
  channel: Channel;
  purposes: Record<ConsentPurpose, PurposeState>;
  dnd: { on: boolean; at: number | null };
  lastChangeAt: number | null;
};

const ERASURE_EVENTS = new Set<ConsentEvent>([
  "erasure_requested",
  "erasure_cancelled",
  "erased",
]);

/** Erasure is person-wide, so it is read from every channel's rows. */
export function deriveErasure(rows: LedgerRow[]): ErasureState {
  let state: ErasureState = { status: "none", at: null };
  for (const row of chronological(rows)) {
    const event = eventOf(row);
    if (!ERASURE_EVENTS.has(event)) continue;
    if (state.status === "erased") break;
    state =
      event === "erasure_cancelled"
        ? { status: "none", at: null }
        : {
            status: event === "erased" ? "erased" : "requested",
            at: state.status === "requested" ? state.at : row.recordedAt,
          };
  }
  return state;
}

/** Current status of one channel: the latest grant or withdrawal per purpose, and DND. */
export function deriveChannel(rows: LedgerRow[], channel: Channel) {
  const purposes = Object.fromEntries(
    CONSENT_PURPOSES.map((purpose) => [
      purpose,
      { status: "none", basis: null, at: null },
    ]),
  ) as Record<ConsentPurpose, PurposeState>;
  const state: ChannelState = {
    channel,
    purposes,
    dnd: { on: false, at: null },
    lastChangeAt: null,
  };
  for (const row of chronological(rows)) {
    if (row.channel !== channel) continue;
    const event = eventOf(row);
    state.lastChangeAt = row.recordedAt;
    if (event === "grant") {
      const purpose = purposeOf(row);
      if (purpose) {
        purposes[purpose] = {
          status: "granted",
          basis: basisOf(row),
          at: row.recordedAt,
        };
      }
    } else if (event === "withdraw") {
      const purpose = purposeOf(row);
      for (const key of purpose ? [purpose] : CONSENT_PURPOSES) {
        purposes[key] = {
          status: "withdrawn",
          basis: null,
          at: row.recordedAt,
        };
      }
    } else if (event === "dnd_on" || event === "dnd_off") {
      state.dnd = { on: event === "dnd_on", at: row.recordedAt };
    }
  }
  return state;
}

export type ContactReason =
  | LawfulBasis
  | "not_found"
  | "erased"
  | "erasure_requested"
  | "no_address"
  | "dnd"
  | "withdrawn"
  | "no_consent"
  | "opt_in_required";

/** What `canContact` returns: whether outreach may happen, and why in words a rep can act on. */
export type ContactDecision = {
  allowed: boolean;
  reason: ContactReason;
  message: string;
  basis: LawfulBasis | null;
  since: number | null;
};

function deny(reason: ContactReason, message: string): ContactDecision {
  return { allowed: false, reason, message, basis: null, since: null };
}

/**
 * The single rule set every outbound path goes through. Denies by default:
 * contact needs a recorded grant for the purpose, WhatsApp needs explicit
 * opt-in, and phone outreach is blocked while the number is on DND.
 */
export function decideContact({
  rows,
  channel,
  purpose,
  hasAddress,
  erasedAt,
}: {
  rows: LedgerRow[];
  channel: Channel;
  purpose: ConsentPurpose;
  hasAddress: boolean;
  erasedAt?: number | null;
}): ContactDecision {
  const erasure = deriveErasure(rows);
  if (erasedAt || erasure.status === "erased") {
    return deny("erased", "Their personal data was erased");
  }
  if (erasure.status === "requested") {
    return deny(
      "erasure_requested",
      "They asked for their data to be erased; contact is paused",
    );
  }
  if (!hasAddress) {
    return deny(
      "no_address",
      channel === "email"
        ? "No email address on file"
        : "No phone number on file",
    );
  }
  const state = deriveChannel(rows, channel);
  if (channel === "phone" && state.dnd.on) {
    return deny(
      "dnd",
      "The number is on DND; promotional calls and SMS aren't allowed",
    );
  }
  const current = state.purposes[purpose];
  const label = CONSENT_PURPOSE_LABEL[purpose].toLowerCase();
  if (current.status === "withdrawn") {
    return deny("withdrawn", `They withdrew consent to ${label}`);
  }
  if (current.status === "none" || !current.basis) {
    return deny("no_consent", `No consent recorded for ${label}`);
  }
  if (channel === "whatsapp" && current.basis !== "consent") {
    return deny(
      "opt_in_required",
      "WhatsApp needs their opt-in; a lawful basis alone isn't enough",
    );
  }
  return {
    allowed: true,
    reason: current.basis,
    message: `Allowed: ${LAWFUL_BASIS_LABEL[current.basis].toLowerCase()} for ${label}`,
    basis: current.basis,
    since: current.at,
  };
}

/** Which address a channel uses. */
export function channelAddress(
  contact: { email?: string | null; phone?: string | null },
  channel: Channel,
) {
  return (channel === "email" ? contact.email : contact.phone) ?? null;
}
