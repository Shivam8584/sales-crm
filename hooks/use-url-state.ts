"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Several setters can run in one event before the router has updated the URL,
// so they build on the pending query instead of `window.location`.
let pending: { path: string; query: URLSearchParams } | null = null;

function currentQuery(pathname: string) {
  if (pending && pending.path === pathname)
    return new URLSearchParams(pending.query);
  return new URLSearchParams(window.location.search);
}

/**
 * Strings kept in the URL query, so filtered and sorted views can be shared and
 * survive reloads. Default values are omitted from the URL.
 */
export function useUrlState(key: string, defaultValue = "") {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = params.get(key) ?? defaultValue;

  const setValue = useCallback(
    (next: string) => {
      const query = currentQuery(pathname);
      if (next === defaultValue || next === "") query.delete(key);
      else query.set(key, next);
      pending = { path: pathname, query };
      queueMicrotask(() => {
        if (pending?.query === query) pending = null;
      });
      const search = query.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, {
        scroll: false,
      });
    },
    [key, defaultValue, pathname, router],
  );

  return [value, setValue] as const;
}
