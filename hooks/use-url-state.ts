"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * A string kept in the URL query, so filtered and sorted views can be shared
 * and survive reloads. Default values are omitted from the URL.
 */
export function useUrlState(key: string, defaultValue = "") {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = params.get(key) ?? defaultValue;

  const setValue = useCallback(
    (next: string) => {
      const query = new URLSearchParams(window.location.search);
      if (next === defaultValue || next === "") query.delete(key);
      else query.set(key, next);
      const search = query.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, {
        scroll: false,
      });
    },
    [key, defaultValue, pathname, router],
  );

  return [value, setValue] as const;
}
