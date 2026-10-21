import type { Metadata } from "next";
import ProposalPrint from "@/features/proposals/proposal-print";

export const metadata: Metadata = {
  title: "Proposal",
  robots: { index: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProposalPrint id={id} />;
}
