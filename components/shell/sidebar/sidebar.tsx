"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/_ui/sheet";
import SidebarContent from "./sidebar-content";
import SidebarResizer from "./sidebar-resizer";
import { useUiStore } from "@/stores/ui-store";

export default function Sidebar() {
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);

  return (
    <>
      <aside className="border-sidebar-border bg-sidebar relative hidden w-(--sidebar-width) shrink-0 border-r lg:flex lg:flex-col">
        <SidebarContent />
        <SidebarResizer />
      </aside>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent
          side="left"
          className="border-sidebar-border bg-sidebar w-64 max-w-[85vw]"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Workspace sections
          </SheetDescription>
          <SidebarContent />
        </SheetContent>
      </Sheet>
    </>
  );
}
