import { ReactNode } from "react";

interface SideNavIconsProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}

export default function SideNavIcons({ icon, label, onClick, active = false }: SideNavIconsProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left border-l-2 ${
        active
          ? "bg-blue-50 text-blue-700 border-blue-600"
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-transparent"
      }`}
    >
      <span className="w-4 flex items-center justify-center shrink-0 text-base">{icon}</span>
      <span className="md:inline hidden">{label}</span>
    </button>
  );
}
