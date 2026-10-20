import { Suspense } from "react";
import CompaniesHeader from "./header/header";
import CompaniesToolbar from "./toolbar/toolbar";
import ActiveFilters from "./toolbar/active-filters";
import CompaniesTable from "./table/companies-table";
import CompaniesSync from "./companies-sync";

export default function Companies() {
  return (
    <section id="companies" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <CompaniesHeader />
      <CompaniesToolbar />
      <ActiveFilters />
      <CompaniesTable />
      <Suspense fallback={null}>
        <CompaniesSync />
      </Suspense>
    </section>
  );
}
