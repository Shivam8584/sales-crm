"use client";

import { useSyncExternalStore } from "react";
import { useCompaniesStore } from "@/stores/companies-store";

export function useStoreHydrated() {
  return useSyncExternalStore(
    (onChange) => useCompaniesStore.persist.onFinishHydration(onChange),
    () => useCompaniesStore.persist.hasHydrated(),
    () => false,
  );
}
