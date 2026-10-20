"use client";

import EmptyState from "@/components/_ui/empty-state";

export function useCompanyContactsCount(companyId: string): number | undefined {
  void companyId;
  return undefined;
}

export default function CompanyContactsTab({
  companyId,
}: {
  companyId: string;
}) {
  void companyId;
  return <EmptyState title="Contacts" description="Not built yet." />;
}
