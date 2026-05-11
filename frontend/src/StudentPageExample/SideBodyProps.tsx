import { SidebarBodyProps, NavItemData } from "./index.ts";
import { NavItem } from "./NavItem.tsx";
import { icons } from "./icons.tsx";

export function SidebarBody({
  activeNav,
  setActiveNav,
  navItems,
  iconOnly,
  onClose,
}: SidebarBodyProps) {
  const handleNavClick = (label: string): void => {
    setActiveNav(label);
    onClose?.();
  };

  return (
    <>
      {/* Logo */}
      <div className={`flex items-center gap-2.5 mb-8 ${iconOnly ? "justify-center" : "px-4"}`}>
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
          {icons.logo}
        </div>
        {!iconOnly && (
          <span className="text-slate-800 font-bold text-lg tracking-tight">Chan</span>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex flex-col gap-1 flex-1">
        {navItems.map((item: NavItemData) => (
          <NavItem
            key={item.label}
            icon={item.icon}
            label={item.label}
            active={activeNav === item.label}
            iconOnly={iconOnly}
            onClick={() => handleNavClick(item.label)}
          />
        ))}
      </nav>

      {/* Bottom nav */}
      <div className={`flex flex-col gap-1 pt-4 border-t border-slate-100 ${iconOnly ? "items-center" : ""}`}>
        <NavItem icon={icons.help}    label="Help"     active={false} iconOnly={iconOnly} onClick={() => {}} />
        <NavItem icon={icons.signout} label="Sign Out" active={false} iconOnly={iconOnly} onClick={() => {}} />

        {iconOnly ? (
          <div className="mt-2 w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center">
            <span className="w-4 h-4 text-indigo-600">{icons.profile}</span>
          </div>
        ) : (
          <div className="mt-2 mx-1 px-3 py-2.5 rounded-xl bg-slate-50 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <span className="w-4 h-4 text-indigo-600">{icons.profile}</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-700">Profile</p>
              <p className="text-xs text-slate-400">View account</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}