"use client";

import { Fragment } from "react";
import { useMembers, useViewer } from "@/hooks/use-viewer";
import { parseBody } from "@/lib/domain/mentions";
import { cn } from "@/lib/utils";

/** A timeline body with `<@id>` tokens shown as name chips; your own mentions stand out. */
export default function EntryBody({
  body,
  mentioned,
}: {
  body: string;
  mentioned: { _id: string; name: string }[];
}) {
  const viewer = useViewer();
  const members = useMembers();
  const segments = parseBody(body);
  return segments.map((segment, index) => {
    if (segment.type === "text") {
      return <Fragment key={index}>{segment.text}</Fragment>;
    }
    const name =
      mentioned.find((member) => member._id === segment.id)?.name ??
      members?.find((member) => member._id === segment.id)?.name;
    const self = segment.id === viewer._id;
    return (
      <span
        key={index}
        className={cn(
          "rounded-[5px] px-1 py-px font-medium whitespace-nowrap",
          self
            ? "bg-(--tag-amber-bg) text-(--tag-amber-text)"
            : "bg-info-surface text-info-foreground",
          !name && "bg-overlay-2 text-fg-tertiary",
        )}
      >
        @{name ?? "former teammate"}
      </span>
    );
  });
}
