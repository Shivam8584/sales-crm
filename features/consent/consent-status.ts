import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { TagTone } from "@/components/_ui/tag";
import {
  CONSENT_PURPOSES,
  CONSENT_PURPOSE_LABEL,
  LAWFUL_BASIS_LABEL,
} from "@/lib/domain/consent";

export type ConsentMatrix = NonNullable<
  FunctionReturnType<typeof api.consents.forPerson>
>;
export type ChannelRow = ConsentMatrix["channels"][number];

/** Tag and one-line detail for a channel row in the matrix. */
export function channelSummary(
  row: ChannelRow,
  erasure: ConsentMatrix["erasure"],
): { label: string; tone: TagTone; detail: string } {
  const granted = CONSENT_PURPOSES.filter(
    (purpose) => row.state.purposes[purpose].status === "granted",
  );
  const withdrawn = CONSENT_PURPOSES.some(
    (purpose) => row.state.purposes[purpose].status === "withdrawn",
  );
  const bases = [
    ...new Set(
      granted.map((purpose) => row.state.purposes[purpose].basis ?? "consent"),
    ),
  ];
  const detail = granted.length
    ? `${bases.map((basis) => LAWFUL_BASIS_LABEL[basis]).join(", ")} · ${granted
        .map((purpose) => CONSENT_PURPOSE_LABEL[purpose])
        .join(", ")}`
    : withdrawn
      ? "Withdrawn for all purposes"
      : row.hasAddress
        ? "No consent or lawful basis"
        : row.channel === "email"
          ? "No email address"
          : "No phone number";

  if (erasure.status === "erased") {
    return { label: "Erased", tone: "neutral", detail: "Personal data erased" };
  }
  if (erasure.status === "requested") {
    return { label: "Paused", tone: "amber", detail };
  }
  if (row.channel === "phone" && row.state.dnd.on) {
    return { label: "DND", tone: "red", detail };
  }
  // Sales outreach is what reps act on, so it decides the tag.
  const sales = row.state.purposes.sales_outreach;
  if (sales.status === "granted") {
    if (
      row.channel === "whatsapp" &&
      (sales.basis ?? "consent") !== "consent"
    ) {
      return { label: "Opt-in needed", tone: "amber", detail };
    }
    return { label: "Granted", tone: "green", detail };
  }
  if (sales.status === "withdrawn") {
    return { label: "Withdrawn", tone: "red", detail };
  }
  if (granted.length) return { label: "Updates only", tone: "amber", detail };
  if (withdrawn) return { label: "Withdrawn", tone: "red", detail };
  return { label: "No record", tone: "neutral", detail };
}
