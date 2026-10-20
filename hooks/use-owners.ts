"use client";

import { OWNERS, type Owner } from "@/data/companies";

/** People who can own records or be assigned work. */
export function useOwners(): Owner[] {
  return OWNERS;
}
