import type { ReactNode } from "react";
import MembershipGate from "@/features/auth/membership-gate";
import AppShell from "@/components/shell/app-shell";

export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <MembershipGate>
      <AppShell>{children}</AppShell>
    </MembershipGate>
  );
}
