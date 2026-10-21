"use client";

import { useCallback, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./sidebar/sidebar";
import CommandMenu from "./command-menu";
import ShortcutsDialog from "./shortcuts-dialog";
import GlobalShortcuts from "./global-shortcuts";
import RecordOverlays from "./record-overlays";
import { useUiStore } from "@/stores/ui-store";

/** What `C` creates on each page; pages not listed have nothing to create. */
const CREATE_BY_PATH = [
  ["/accounts", { type: "account" }],
  ["/people", { type: "person" }],
  ["/leads", { type: "lead" }],
  ["/deals", { type: "deal" }],
  ["/tasks", { type: "task" }],
  ["/today", { type: "task" }],
] as const;

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const createForPage = useCallback(() => {
    if (pathname.startsWith("/settings/team")) {
      const params = new URLSearchParams(window.location.search);
      params.set("invite", "1");
      router.replace(`${pathname}?${params}`, { scroll: false });
      return;
    }
    const match = CREATE_BY_PATH.find(([prefix]) =>
      pathname.startsWith(prefix),
    );
    if (match) useUiStore.getState().setCreate({ ...match[1] });
  }, [pathname, router]);

  return (
    <div className="flex h-dvh max-w-full overflow-hidden">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      <CommandMenu />
      <ShortcutsDialog />
      <RecordOverlays />
      <GlobalShortcuts onCreate={createForPage} />
    </div>
  );
}
