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
      <aside
        data-sidebar="desktop"
        className="border-sidebar-border bg-sidebar collapsed:w-12 relative hidden w-(--sidebar-width) shrink-0 border-r lg:flex lg:flex-col"
      >
        <SidebarContent />
        <span className="collapsed:hidden contents">
          <SidebarResizer />
        </span>
      </aside>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent
          side="left"
          className="border-sidebar-border bg-sidebar w-72 max-w-[85vw]"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Workspace sections
          </SheetDescription>
          <SidebarContent variant="drawer" />
        </SheetContent>
      </Sheet>
    </>
  );
}
