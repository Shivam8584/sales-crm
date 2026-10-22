import type { Id } from "@/convex/_generated/dataModel";
import PersonPage from "@/features/people/person-page";

export const metadata = { title: "Person" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PersonPage id={id as Id<"people">} />;
}
