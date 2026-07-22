import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface TestTableRowProps {
  id: string;
  name: string;
  date: string;
  completed: boolean;
  score: number | null;
  wasReset?: boolean;
  onReset?: () => void;
  onReport?: () => void;
  reportLoading?: boolean;
}

export default function TestTableRow({ id, name, date, completed, score, wasReset = false, onReset, onReport, reportLoading }: TestTableRowProps) {
  const navigate = useNavigate();
  const [confirmReset, setConfirmReset] = useState(false);
  const isDiagnostic = name === "Diagnostic Test";

  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Row header */}
      <div className="flex flex-wrap items-center justify-between px-4 py-3 sm:px-5 sm:py-4 gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <h3 className="text-base font-semibold text-slate-900 truncate">{name || "Untitled"}</h3>
          <p className="text-sm text-slate-500">{date}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 justify-end">
          {completed && score !== null ? (
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full tabular-nums ${
              score >= 70 ? "bg-emerald-50 text-emerald-700" :
              score >= 50 ? "bg-amber-50 text-amber-700" :
              "bg-rose-50 text-rose-700"
            }`}>
              {score}%
            </span>
          ) : wasReset ? (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">
              Not Started
            </span>
          ) : (
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              completed ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}>
              {completed ? "Completed" : "In Progress"}
            </span>
          )}

          {/* Reset — only for in-progress non-diagnostic tests */}
          {!completed && !isDiagnostic && onReset && (
            confirmReset ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-500 shrink-0">Reset?</span>
                <button
                  type="button"
                  onClick={() => { onReset(); setConfirmReset(false); }}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white transition-colors shrink-0"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-2 py-1 rounded-lg text-xs text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-500 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors"
              >
                Reset
              </button>
            )
          )}

          {completed && onReport && (
            <button
              type="button"
              onClick={onReport}
              disabled={reportLoading}
              className="flex items-center gap-1.5 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium text-violet-600 hover:text-violet-800 hover:bg-violet-50 border border-violet-200 transition-colors disabled:opacity-50 shrink-0"
            >
              {reportLoading ? (
                <span className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
              ) : null}
              {reportLoading ? "Generating…" : "Report"}
            </button>
          )}

          <button
            type="button"
            onClick={() => navigate(completed ? `/results/${id}` : `/mock/${id}`)}
            className={`px-3 py-1 sm:px-4 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors shrink-0 ${
              completed
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
            }`}
          >
            {completed ? "View" : "Continue"}
          </button>
        </div>
      </div>

    </div>
  );
}
