import { NavItemData } from "./index.ts";
import { SidebarBody } from "./Sidebarbody.tsx";
import { icons } from "./Icons.tsx";

interface MobileDrawerProps {
  activeNav: string;
  setActiveNav: (label: string) => void;
  navItems: NavItemData[];
  onClose: () => void;
}

export function MobileDrawer({
  activeNav,
  setActiveNav,
  navItems,
  onClose,
}: MobileDrawerProps) {
  return (
    <div className="fixed inset-0 z-40 md:hidden">
      {/* Dim backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Drawer panel */}
      <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white flex flex-col py-6 px-3 shadow-2xl z-50">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
        >
          <span className="w-5 h-5">{icons.close}</span>
        </button>
        <SidebarBody
          activeNav={activeNav}
          setActiveNav={setActiveNav}
          navItems={navItems}
          iconOnly={false}
          onClose={onClose}
        />
      </aside>
    </div>
  );
}