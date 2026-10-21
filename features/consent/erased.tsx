"use client";

import Tag from "@/components/_ui/tag";
import Tooltip from "@/components/_ui/tooltip";
import { dateTime, shortDate } from "@/lib/time";

/** Marks a record whose personal data was erased; such records are read-only. */
export function ErasedTag({ erasedAt }: { erasedAt: number }) {
  return (
    <Tooltip content={`Erased ${dateTime(erasedAt)}`}>
      <Tag tone="neutral" size="sm">
        Erased {shortDate(erasedAt)}
      </Tag>
    </Tooltip>
  );
}

export function ErasedNotice() {
  return (
    <p className="bg-card shadow-card text-fg-secondary rounded-xl px-4 py-3 text-sm leading-relaxed">
      This person&apos;s personal data was erased on request. The record stays
      as proof of consent and erasure, and can&apos;t be edited.
    </p>
  );
}
