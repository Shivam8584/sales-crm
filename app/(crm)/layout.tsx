import type { ReactNode } from "react";
import AuthGate from "@/components/auth/auth-gate";
import Sidebar from "@/components/_common/sidebar/sidebar";
import CrmOverlays from "@/components/_common/crm-overlays";

export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <main className="flex h-dvh max-w-full overflow-hidden">
        <Sidebar />
        {children}
        <CrmOverlays />
      </main>
    </AuthGate>
  );
}
