import type { Metadata } from "next";
import AuthCard from "@/features/auth/auth-card";
import ReloadButton from "./reload-button";

export const metadata: Metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <AuthCard
      title="You're offline"
      description="Hypedrive CRM needs a connection. We'll reconnect as soon as you're back online."
    >
      <div className="border-border border-t px-6 py-5">
        <ReloadButton />
      </div>
    </AuthCard>
  );
}
