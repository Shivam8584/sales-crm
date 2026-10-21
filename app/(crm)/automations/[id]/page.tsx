import { Suspense } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import AutomationPage from "@/features/automations/automation-page";

export const metadata = { title: "Automation" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense>
      <AutomationPage id={id as Id<"automations">} />
    </Suspense>
  );
}
