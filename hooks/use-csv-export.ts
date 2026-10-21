"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "@/convex/_generated/api";
import { istToday } from "@/lib/domain/day";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";

type List = FunctionArgs<typeof api.exports.csv>["list"];

/**
 * Exports the whole filtered list (not just the loaded rows): the server
 * builds the CSV in batches and hands back a short-lived file to download.
 */
export function useCsvExport(noun: [singular: string, plural: string]) {
  const run = useAction(api.exports.csv);
  const [pending, setPending] = useState(false);

  async function exportCsv(list: List) {
    setPending(true);
    try {
      const { url, count } = await run({ list });
      const response = await fetch(url);
      if (!response.ok) throw new Error("Couldn't download the export");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(await response.blob());
      link.download = `${list.name}-${istToday()}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      toast(`Exported ${count} ${count === 1 ? noun[0] : noun[1]}`);
    } catch (error) {
      toast(readError(error, "Couldn't export the list").message, {
        tone: "danger",
      });
    } finally {
      setPending(false);
    }
  }

  return { exportCsv, pending };
}
