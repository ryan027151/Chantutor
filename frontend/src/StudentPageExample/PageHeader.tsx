import { icons } from "./icons.tsx";

interface PageHeaderProps {
  studentName: string;
  onNewTest: () => void;
}

export function PageHeader({ studentName, onNewTest }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6 sm:mb-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">
          Welcome back
        </h1>
        <p className="text-slate-400 mt-1 text-sm font-medium">{studentName} — Student</p>
      </div>
      <button
        onClick={onNewTest}
        className="flex-shrink-0 flex items-center gap-1.5 sm:gap-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold rounded-xl shadow-lg shadow-indigo-200 transition-all hover:-translate-y-0.5 text-xs sm:text-sm px-3 sm:px-5 py-2 sm:py-2.5"
      >
        <span className="w-4 h-4">{icons.plus}</span>
        <span className="hidden sm:inline">Take New Test</span>
        <span className="sm:hidden">New Test</span>
      </button>
    </div>
  );
}