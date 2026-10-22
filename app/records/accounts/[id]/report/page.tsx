import type { Metadata } from "next";
import type { Id } from "@/convex/_generated/dataModel";
import ReportPage from "@/features/brand-report/report-page";

export const metadata: Metadata = {
  title: "Results report",
  robots: { index: false },
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string; key?: string }>;
}) {
  const [{ id }, { kind, key }] = await Promise.all([params, searchParams]);
  return (
    <ReportPage
      id={id as Id<"accounts">}
      kind={kind === "quarter" ? "quarter" : "month"}
      periodKey={key}
    />
  );
}
