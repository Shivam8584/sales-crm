"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/stores/toast-store";

/** A merged-away record's page sends you to the record it became part of. */
export function useMergedRedirect(
  mergedInto: { _id: string; name: string } | null | undefined,
  table: "accounts" | "people",
) {
  const router = useRouter();
  const id = mergedInto?._id;
  const name = mergedInto?.name;
  useEffect(() => {
    if (!id) return;
    router.replace(`/${table}/${id}`);
    toast(`Merged into ${name}`);
  }, [id, name, table, router]);
}
