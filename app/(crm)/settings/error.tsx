"use client";

import { SectionError } from "@/features/auth/section-states";

export default function SettingsError(
  props: Parameters<typeof SectionError>[0],
) {
  return <SectionError {...props} bare />;
}
