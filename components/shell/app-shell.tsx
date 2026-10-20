"use client";

import { useCallback, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./sidebar/sidebar";
import CommandMenu from "./command-menu";
import ShortcutsDialog from "./shortcuts-dialog";
import GlobalShortcuts from "./global-shortcuts";
import RecordOverlays from "./record-overlays";
import { useUiStore } from "@/stores/ui-store";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const createForPage = useCallback(() => {
    const setCreate = useUiStore.getState().setCreate;
    setCreate(
      pathname.startsWith("/people") ? { type: "person" } : { type: "account" },
    );
  }, [pathname]);

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
