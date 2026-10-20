"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  ACTIVITY_WINDOWS,
  OWNERS,
  SORT_OPTIONS,
  type SortKey,
} from "@/data/companies";
import {
  DEFAULT_FILTERS,
  VIEWS,
  defaultSortDir,
  type CompanyFilters,
  type View,
} from "@/lib/companies";
import { STAGE_OPTIONS } from "./toolbar/filter-options";
import { useCompaniesStore } from "@/stores/companies-store";

const FILTER_PARAMS = [
  "view",
  "sort",
  "dir",
  "owner",
  "stage",
  "activity",
] as const;

function parseFilters(params: URLSearchParams): CompanyFilters {
  const sort = params.get("sort");
  const owner = params.get("owner");
  const stage = params.get("stage");
  const activity = Number(params.get("activity"));
  const dir = params.get("dir");
  const view = params.get("view");
  const sortBy = SORT_OPTIONS.some((option) => option.value === sort)
    ? (sort as SortKey)
    : DEFAULT_FILTERS.sortBy;

  return {
    sortBy,
    sortDir: dir === "asc" || dir === "desc" ? dir : defaultSortDir(sortBy),
    view: VIEWS.some((item) => item.value === view)
      ? (view as View)
      : DEFAULT_FILTERS.view,
    owner: OWNERS.some((item) => item.name === owner)
      ? owner!
      : DEFAULT_FILTERS.owner,
    stage: STAGE_OPTIONS.some((option) => option.value === stage)
      ? stage!
      : DEFAULT_FILTERS.stage,
    activityWindow: (ACTIVITY_WINDOWS as readonly number[]).includes(activity)
      ? activity
      : DEFAULT_FILTERS.activityWindow,
  };
}

function filtersQuery(filters: CompanyFilters, base: URLSearchParams) {
  const params = new URLSearchParams(base);
  FILTER_PARAMS.forEach((key) => params.delete(key));
  if (filters.view !== DEFAULT_FILTERS.view) {
    params.set("view", filters.view);
  }
  if (filters.sortBy !== DEFAULT_FILTERS.sortBy) {
    params.set("sort", filters.sortBy);
  }
  if (filters.sortDir !== defaultSortDir(filters.sortBy)) {
    params.set("dir", filters.sortDir);
  }
  if (filters.owner !== DEFAULT_FILTERS.owner) {
    params.set("owner", filters.owner);
  }
  if (filters.stage !== DEFAULT_FILTERS.stage) {
    params.set("stage", filters.stage);
  }
  if (filters.activityWindow !== DEFAULT_FILTERS.activityWindow) {
    params.set("activity", String(filters.activityWindow));
  }
  return params.toString();
}

function sameFilters(a: CompanyFilters, b: CompanyFilters) {
  return (
    a.sortBy === b.sortBy &&
    a.sortDir === b.sortDir &&
    a.view === b.view &&
    a.owner === b.owner &&
    a.stage === b.stage &&
    a.activityWindow === b.activityWindow
  );
}

export default function CompaniesSync() {
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  useEffect(() => {
    useCompaniesStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    const fromUrl = parseFilters(new URLSearchParams(query));
    if (!sameFilters(useCompaniesStore.getState(), fromUrl)) {
      useCompaniesStore.setState(fromUrl);
    }
  }, [query]);

  useEffect(
    () =>
      useCompaniesStore.subscribe((state) => {
        const current = new URLSearchParams(window.location.search);
        if (sameFilters(state, parseFilters(current))) return;
        const next = filtersQuery(state, current);
        window.history.pushState(
          null,
          "",
          next ? `?${next}` : window.location.pathname,
        );
      }),
    [],
  );

  return null;
}
