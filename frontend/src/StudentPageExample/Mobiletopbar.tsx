import { icons } from "./Icons.tsx";

interface MobileTopBarProps {
  onMenuClick: () => void;
}

export function MobileTopBar({ onMenuClick }: MobileTopBarProps) {
  return (
    <div className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
          {icons.logo}
        </div>
        <span className="font-bold text-slate-800 tracking-tight">Chan</span>
      </div>
      <button
        onClick={onMenuClick}
        className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 transition-colors"
      >
        <span className="w-5 h-5">{icons.menu}</span>
      </button>
    </div>
  );
}