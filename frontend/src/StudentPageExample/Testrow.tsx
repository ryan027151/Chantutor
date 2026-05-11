import { Test } from "./index.ts";
import { icons } from "./Icons.tsx";
import { scoreBadgeClass, formatScore } from "./score.ts";

interface TestRowProps {
  test: Test;
  isLast: boolean;
}

export function TestRow({ test, isLast }: TestRowProps) {
  return (
    <div
      className={`flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 hover:bg-slate-50 transition-colors ${
        !isLast ? "border-b border-slate-50" : ""
      }`}
    >
      {/* Left side: icon + name + date */}
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
            test.status === "completed" ? "bg-emerald-100" : "bg-amber-100"
          }`}
        >
          <span
            className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${
              test.status === "completed" ? "text-emerald-600" : "text-amber-500"
            }`}
          >
            {test.status === "completed" ? icons.tests : icons.play}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-700 truncate">{test.name}</p>
          <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">{test.date}</p>
        </div>
      </div>

      {/* Right side: score badge + action button */}
      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 ml-2">
        {/* Score badge — visible on sm+ */}
        <span
          className={`hidden sm:inline-block text-xs sm:text-sm font-bold px-2.5 sm:px-3 py-1 rounded-lg ${scoreBadgeClass(test.score)}`}
        >
          {formatScore(test.score)}
        </span>

        {/* Mobile: status dot */}
        <span
          className={`sm:hidden w-2 h-2 rounded-full ${
            test.status === "completed" ? "bg-emerald-400" : "bg-amber-400"
          }`}
        />

        <button className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 sm:px-3 py-1.5 rounded-lg transition-all whitespace-nowrap">
          {test.status === "completed" ? "Review" : "Continue"}
          <span className="w-3 h-3 sm:w-3.5 sm:h-3.5">{icons.chevron}</span>
        </button>
      </div>
    </div>
  );
}