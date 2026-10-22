import SidebarContent from "./sidebar-content";
import SidebarResizer from "./sidebar-resizer";

export default function Sidebar() {
  return (
    <aside
      data-sidebar="desktop"
      className="border-sidebar-border bg-sidebar collapsed:w-18 ease-out-hd relative hidden w-(--sidebar-width) shrink-0 border-r transition-[width] duration-280 lg:flex lg:flex-col [html[data-sidebar-resizing]_&]:transition-none"
    >
      <SidebarContent />
      <span className="collapsed:hidden contents">
        <SidebarResizer />
      </span>
    </aside>
  );
}
