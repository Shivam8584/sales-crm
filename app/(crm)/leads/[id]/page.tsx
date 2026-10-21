import type { Id } from "@/convex/_generated/dataModel";
import LeadPage from "@/features/leads/lead-page";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LeadPage id={id as Id<"leads">} />;
}
