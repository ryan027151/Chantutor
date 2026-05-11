import { NavItemProps } from "./index.ts";

export function NavItem({ icon, label, active, onClick, iconOnly }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      title={iconOnly ? label : undefined}
      className={[
        "w-full flex items-center rounded-xl text-sm font-medium transition-all duration-200 group",
        iconOnly ? "justify-center px-0 py-3" : "gap-3 px-4 py-3",
        active
          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
      ].join(" ")}
    >
      <span
        className={`w-5 h-5 flex-shrink-0 ${
          active ? "text-white" : "text-slate-400 group-hover:text-indigo-500"
        }`}
      >
        {icon}
      </span>
      {!iconOnly && <span>{label}</span>}
    </button>
  );
}