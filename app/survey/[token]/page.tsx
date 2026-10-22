import type { Metadata } from "next";
import SurveyPage from "@/features/surveys/survey-page";

export const metadata: Metadata = {
  title: { absolute: "Quick question · Hypedrive" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SurveyPage token={token} />;
}
