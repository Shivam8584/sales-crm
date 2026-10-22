import { Suspense } from "react";
import AgentsPage from "@/features/agents/agents-page";

export const metadata = { title: "Agents" };

export default function Page() {
  return (
    <Suspense>
      <AgentsPage />
    </Suspense>
  );
}
