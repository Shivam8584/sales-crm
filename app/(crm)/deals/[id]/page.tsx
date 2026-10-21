import type { Id } from "@/convex/_generated/dataModel";
import DealPage from "@/features/deals/deal-page";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DealPage id={id as Id<"deals">} />;
}
