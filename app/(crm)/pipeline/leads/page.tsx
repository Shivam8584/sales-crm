import { Suspense } from "react";
import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";
import LeadsPage from "@/features/leads/leads-page";

export const metadata = { title: "Leads" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Older notifications and alerts linked to `/pipeline/leads?lead=<id>`.
  const { lead } = await searchParams;
  if (typeof lead === "string" && lead) {
    redirect(routes.lead(encodeURIComponent(lead)));
  }
  return (
    <Suspense>
      <LeadsPage />
    </Suspense>
  );
}
