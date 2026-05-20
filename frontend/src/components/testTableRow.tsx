import { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase-client";
import { UserContext } from "./userContext";

interface TestTableRowProps {
  id: string;
  name: string;
  date: string;
  completed: boolean;
  score: number | null;
  wasReset?: boolean;
  onReset?: () => void;
}

interface AIAnalysis {
  strengths: string[];
  improvements: string[];
  recommendations: string[];
}

const ANALYSIS_COLORS = {
  strengths:       { border: "border-emerald-400", bg: "bg-emerald-50", text: "text-emerald-800", bullet: "text-emerald-500", title: "Strengths" },
  improvements:    { border: "border-amber-400",   bg: "bg-amber-50",   text: "text-amber-800",   bullet: "text-amber-500",   title: "Areas to Improve" },
  recommendations: { border: "border-blue-400",    bg: "bg-blue-50",    text: "text-blue-800",    bullet: "text-blue-500",    title: "Study Recommendations" },
} as const;

export default function TestTableRow({ id, name, date, completed, score, wasReset = false, onReset }: TestTableRowProps) {
  const navigate = useNavigate();
  const user = useContext(UserContext);
  const [confirmReset, setConfirmReset] = useState(false);
  const [aiState, setAiState] = useState<null | "loading" | "error" | AIAnalysis>(null);
  const isDiagnostic = name === "Diagnostic Test";

  async function runAI() {
    if (!user || aiState === "loading") return;
    setAiState("loading");
    try {
      const { data, error } = await supabase.functions.invoke("analyze-performance", {
        body: { test_id: id, user_id: user.id },
      });
      if (error || !data) throw new Error();
      setAiState(data as AIAnalysis);
    } catch {
      setAiState("error");
    }
  }

  const analysisData = aiState !== null && aiState !== "loading" && aiState !== "error"
    ? (aiState as AIAnalysis)
    : null;

  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Row header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-base font-semibold text-slate-900">{name || "Untitled"}</h3>
          <p className="text-sm text-slate-500">{date}</p>
        </div>
        <div className="flex items-center gap-3">
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
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500">Reset progress?</span>
                <button
                  type="button"
                  onClick={() => { onReset(); setConfirmReset(false); }}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white transition-colors"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-2 py-1 rounded-lg text-xs text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
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

          {/* AI Analysis button — completed tests only */}
          {completed && (
            <button
              type="button"
              disabled={aiState === "loading"}
              onClick={runAI}
              title={
                analysisData ? "Re-run AI analysis" :
                aiState === "error" ? "Analysis failed — click to retry" :
                "Get AI coaching feedback for this test"
              }
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
                analysisData   ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" :
                aiState === "error" ? "bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100" :
                aiState === "loading" ? "bg-slate-50 text-slate-400 border-slate-200" :
                "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600"
              }`}
            >
              {aiState === "loading" ? (
                <span className="flex items-center gap-1.5">
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analyzing…
                </span>
              ) : analysisData ? "✓ Analysis ready" :
                 aiState === "error" ? "Retry analysis" :
                 "AI Analysis"}
            </button>
          )}

          <button
            type="button"
            onClick={() => navigate(completed ? `/results/${id}` : `/mock/${id}`)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              completed
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
            }`}
          >
            {completed ? "View" : "Continue"}
          </button>
        </div>
      </div>

      {/* Inline AI analysis */}
      {analysisData && (
        <div className="border-t border-slate-100 px-5 py-4 bg-slate-50 flex flex-col gap-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-xs font-bold text-slate-700">AI Coach</span>
            <span className="ml-auto text-xs text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
              Powered by Claude
            </span>
          </div>
          {(["strengths", "improvements", "recommendations"] as const).map(key => {
            const c = ANALYSIS_COLORS[key];
            return (
              <div key={key} className={`border-l-4 rounded-r-xl p-3.5 ${c.border} ${c.bg}`}>
                <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${c.text}`}>{c.title}</p>
                <ul className="flex flex-col gap-1.5">
                  {analysisData[key].map((item, i) => (
                    <li key={i} className={`text-sm flex gap-2 ${c.text} opacity-90`}>
                      <span className={`${c.bullet} shrink-0 mt-0.5`}>›</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {aiState === "error" && (
        <div className="border-t border-slate-100 px-5 py-3 bg-rose-50 text-xs text-rose-600">
          Analysis failed. Try again or view the full results page.
        </div>
      )}
    </div>
  );
}
