import SidebarContent from "./sidebar-content";
import SidebarResizer from "./sidebar-resizer";

export default function Sidebar() {
  return (
    <aside
      data-sidebar="desktop"
      className="border-sidebar-border bg-sidebar collapsed:w-12 relative hidden w-(--sidebar-width) shrink-0 border-r lg:flex lg:flex-col"
    >
      <SidebarContent />
      <span className="collapsed:hidden contents">
        <SidebarResizer />
      </span>
    </aside>
  );
}
