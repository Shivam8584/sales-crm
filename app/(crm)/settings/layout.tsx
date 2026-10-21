import type { ReactNode } from "react";
import SettingsLayout from "@/features/settings/settings-layout";

export default function Layout({ children }: { children: ReactNode }) {
  return <SettingsLayout>{children}</SettingsLayout>;
}
