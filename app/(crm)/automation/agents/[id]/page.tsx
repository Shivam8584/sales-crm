import { Suspense } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import AgentPage from "@/features/agents/agent-page";

export const metadata = { title: "Agent" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense>
      <AgentPage id={id as Id<"agents">} />
    </Suspense>
  );
}
