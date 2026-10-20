"use client";

import EmptyState from "@/components/_ui/empty-state";

export function useCompanyTasksCount(companyId: string): number | undefined {
  void companyId;
  return undefined;
}

export default function CompanyTasksTab({ companyId }: { companyId: string }) {
  void companyId;
  return <EmptyState title="Tasks" description="Not built yet." />;
}
