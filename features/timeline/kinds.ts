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
  | { personId: Id<"people"> };

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
