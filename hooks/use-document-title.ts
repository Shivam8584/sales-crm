"use client";

import { useEffect } from "react";
import { SITE_NAME } from "@/lib/seo";

/** Route metadata is static; record names only arrive with the client query. */
export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    if (title) document.title = `${title} · ${SITE_NAME}`;
  }, [title]);
}
