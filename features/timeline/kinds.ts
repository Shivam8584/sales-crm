import type { ComponentType, SVGProps } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import type { TimelineKind } from "@/lib/domain/enums";
import NoteIcon from "@/public/assets/icons/note.svg";
import PhoneCallIcon from "@/public/assets/icons/phone-call.svg";
import CalendarIcon from "@/public/assets/icons/calendar-sm.svg";
import MailIcon from "@/public/assets/icons/mail-03.svg";
import MessageIcon from "@/public/assets/icons/message.svg";
import EditIcon from "@/public/assets/icons/edit.svg";
import DotIcon from "@/public/assets/icons/dot.svg";

export type TimelineTarget =
  | { accountId: Id<"accounts"> }
  | { personId: Id<"people"> }
  | { dealId: Id<"deals"> }
  | { leadId: Id<"leads"> };

export const LOGGABLE_KINDS = [
  "note",
  "call",
  "meeting",
  "email",
  "whatsapp",
] as const;
export type LoggableKind = (typeof LOGGABLE_KINDS)[number];

export const KIND_META: Record<
  TimelineKind,
  { label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }
> = {
  note: { label: "Note", icon: NoteIcon },
  call: { label: "Call", icon: PhoneCallIcon },
  meeting: { label: "Meeting", icon: CalendarIcon },
  email: { label: "Email", icon: MailIcon },
  whatsapp: { label: "WhatsApp", icon: MessageIcon },
  change: { label: "Change", icon: EditIcon },
  system: { label: "Event", icon: DotIcon },
};

export const FILTERS = [
  { id: "all", label: "All" },
  { id: "notes", label: "Notes" },
  { id: "calls", label: "Calls" },
  { id: "emails", label: "Emails" },
  { id: "changes", label: "Changes" },
  { id: "platform", label: "Platform" },
] as const;
export type TimelineFilter = (typeof FILTERS)[number]["id"];

/**
 * Entries without an actor were written by the Hypedrive platform webhook or
 * an automation, so they count as platform activity rather than team changes.
 */
export function filterOf(entry: {
  kind: TimelineKind;
  actorId?: string;
}): Exclude<TimelineFilter, "all"> {
  switch (entry.kind) {
    case "note":
      return "notes";
    case "call":
    case "meeting":
    case "whatsapp":
      return "calls";
    case "email":
      return "emails";
    default:
      return entry.actorId ? "changes" : "platform";
  }
}
