"use client";

import EmptyState from "@/components/_ui/empty-state";

export function useCompanyDealsCount(companyId: string): number | undefined {
  void companyId;
  return undefined;
}

export default function CompanyDealsTab({ companyId }: { companyId: string }) {
  void companyId;
  return <EmptyState title="Deals" description="Not built yet." />;
}
