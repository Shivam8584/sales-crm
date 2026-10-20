"use client";

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import Tag from "@/components/_ui/tag";
import PageTitleBar from "@/components/_common/page-title-bar";
import { Tabs, TabsList, TabsTrigger } from "@/components/_ui/tabs";
import { useCompaniesStore } from "@/stores/companies-store";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import {
  VIEWS,
  filterCompanies,
  pickFilters,
  type View,
} from "@/lib/companies";
import ActiveDot from "@/public/assets/images/companies/header/active-dot.svg";

export default function CompaniesHeader() {
  const view = useCompaniesStore((state) => state.view);
  const setView = useCompaniesStore((state) => state.setView);
  const companies = useCompaniesStore((state) => state.companies);
  const filters = useCompaniesStore(useShallow(pickFilters));
  const hydrated = useStoreHydrated();
  const counts = useMemo(
    () =>
      Object.fromEntries(
        VIEWS.map((item) => [
          item.value,
          filterCompanies(companies, { ...filters, view: item.value }).length,
        ]),
      ),
    [companies, filters],
  );

  return (
    <header className="shrink-0">
      <PageTitleBar
        title="Companies"
        badge={
          <Tag
            tone="neutral"
            size="xs"
            className="text-foreground gap-0.5 pl-0.5 max-[399px]:hidden"
          >
            <ActiveDot aria-hidden className="text-status size-3" />
            Active
          </Tag>
        }
      />

      <Tabs value={view} onValueChange={(value) => setView(value as View)}>
        <TabsList
          aria-label="Saved views"
          className="scrollbar-none overflow-x-auto px-4 shadow-[inset_0_-1px_0_var(--border)]"
        >
          {VIEWS.map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className="short:py-2.5"
            >
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                {item.label}
                <span className="text-fg-tertiary tabular-nums">
                  {hydrated ? counts[item.value] : "–"}
                </span>
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </header>
  );
}
