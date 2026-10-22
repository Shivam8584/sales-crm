import { Suspense } from "react";
import AutomationsPage from "@/features/automations/automations-page";

export const metadata = { title: "Sequences" };

export default function Page() {
  return (
    <Suspense>
      <AutomationsPage />
    </Suspense>
  );
}
