import { useEffect, useState } from "react";
import { supabase } from "../supabase-client";

interface QuestionResult { order_index: number; is_correct: boolean | null; }
interface AIAnalysis { strengths: string[]; improvements: string[]; recommendations: string[]; }
interface TestInfo {
  test_name: string; created_at: string; total_questions: number;
  configuration: Record<string, { count: number }> | null;
}

function ScoreCircle({ correct, total }: { correct: number; total: number }) {
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const color = pct >= 70 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative w-28 h-28 rounded-full"
        style={{ background: `conic-gradient(${color} ${pct}%, #27272a ${pct}%)` }}
      >
        <div className="absolute inset-2.5 bg-zinc-900 rounded-full flex flex-col items-center justify-center gap-0.5">
          <span className="text-2xl font-bold text-white">{pct}%</span>
          <span className="text-xs text-zinc-500">score</span>
        </div>
      </div>
      <p className="text-xs text-zinc-500">{correct} / {total} correct</p>
    </div>
  );
}

function SectionBar({ label, correct, total, colorClass }: { label: string; correct: number; total: number; colorClass: string }) {
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span className="font-medium text-zinc-300">{label}</span>
        <span className="text-zinc-500">{correct}/{total} · {pct}%</span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const ANALYSIS_COLORS = {
  strengths:       { card: "bg-emerald-500/5 border-emerald-500/20", title: "text-emerald-400", bullet: "text-emerald-500", text: "text-emerald-100" },
  improvements:    { card: "bg-amber-500/5 border-amber-500/20",   title: "text-amber-400",   bullet: "text-amber-500",   text: "text-amber-100"   },
  recommendations: { card: "bg-blue-500/5 border-blue-500/20",     title: "text-blue-400",    bullet: "text-blue-500",    text: "text-blue-100"    },
} as const;

interface ResultsModalProps {
  testID: string;
  userID: string;
  onClose: () => void;
}

export default function ResultsModal({ testID, userID, onClose }: ResultsModalProps) {
  const [test, setTest] = useState<TestInfo | null>(null);
  const [questions, setQuestions] = useState<QuestionResult[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiError, setAiError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);

      const [{ data: testData }, { data: qData }] = await Promise.all([
        supabase.from("tests").select("test_name, created_at, total_questions, configuration").eq("id", testID).single(),
        supabase.from("questions").select("order_index, is_correct").eq("test_id", testID).eq("user_id", userID).order("order_index"),
      ]);

      if (testData) setTest(testData as TestInfo);
      if (qData) setQuestions(qData as QuestionResult[]);
      setLoading(false);

      try {
        const { data: aiData, error: aiErr } = await supabase.functions.invoke("analyze-performance", {
          body: { test_id: testID, user_id: userID },
        });
        if (aiErr || !aiData) throw new Error();
        setAiAnalysis(aiData as AIAnalysis);
      } catch {
        setAiError(true);
      } finally {
        setAiLoading(false);
      }
    })();
  }, [testID, userID]);

  const englishCount = test?.configuration?.english?.count ?? Math.floor((test?.total_questions ?? 0) / 2);
  const mathCount    = test?.configuration?.math?.count    ?? Math.ceil((test?.total_questions  ?? 0) / 2);
  const totalQ       = test?.total_questions ?? 0;

  const totalCorrect = questions.filter(q => q.is_correct === true).length;
  const engCorrect   = questions.filter(q => q.order_index < englishCount && q.is_correct === true).length;
  const mathCorrect  = questions.filter(q => q.order_index >= englishCount && q.is_correct === true).length;

  const fallback: AIAnalysis = {
    strengths: [
      engCorrect >= englishCount * 0.7 ? "Strong ELA performance" : "Consistent effort across sections",
      mathCorrect >= mathCount * 0.7 ? "Solid math fundamentals" : "Good attempt on challenging content",
      `Completed ${questions.length} of ${totalQ} questions`,
    ],
    improvements: [
      engCorrect < englishCount * 0.7 ? "Focus on reading comprehension" : "Push for higher ELA accuracy",
      mathCorrect < mathCount * 0.7 ? "Review core math concepts" : "Target harder math problems",
      "Revisit incorrectly answered questions",
    ],
    recommendations: [
      "Practice with timed sessions to build endurance",
      "Review explanations for all incorrect answers",
      "Spend extra time on the lower-scoring section",
    ],
  };

  const analysis = aiAnalysis ?? (aiError ? fallback : null);

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-start justify-center overflow-y-auto p-6">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-2xl my-auto flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-bold text-white">{test?.test_name ?? "Results"}</h2>
            {test && (
              <p className="text-xs text-zinc-600 mt-0.5">
                {new Date(test.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="p-6 flex flex-col gap-5 overflow-y-auto">

            {/* Score + bars */}
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 flex flex-col gap-5">
              <ScoreCircle correct={totalCorrect} total={totalQ} />
              <div className="flex flex-col gap-3">
                <SectionBar label="English / ELA" correct={engCorrect} total={englishCount} colorClass="bg-blue-500" />
                <SectionBar label="Math"           correct={mathCorrect} total={mathCount}   colorClass="bg-violet-500" />
              </div>
            </div>

            {/* AI Coach */}
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                  <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <span className="text-sm font-bold text-white">AI Coach</span>
                <span className={`ml-auto text-xs px-2 py-0.5 rounded-full border font-medium ${
                  aiLoading ? "text-zinc-500 border-zinc-700"
                  : !aiError ? "text-amber-400 border-amber-500/20 bg-amber-500/5"
                  : "text-zinc-500 border-zinc-700"
                }`}>
                  {aiLoading ? "Analyzing…" : !aiError ? "Powered by Claude" : "Auto summary"}
                </span>
              </div>
              {aiLoading ? (
                <div className="flex flex-col gap-2 animate-pulse">
                  <div className="h-3 bg-zinc-800 rounded-full w-4/5" />
                  <div className="h-3 bg-zinc-800 rounded-full w-3/5" />
                  <div className="h-3 bg-zinc-800 rounded-full w-2/3" />
                </div>
              ) : analysis && (
                <div className="flex flex-col gap-3">
                  {(["strengths", "improvements", "recommendations"] as const).map(key => {
                    const labels = { strengths: "Strengths", improvements: "Areas to Improve", recommendations: "What to Do Next" };
                    const c = ANALYSIS_COLORS[key];
                    return (
                      <div key={key} className={`rounded-xl p-4 border ${c.card}`}>
                        <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${c.title}`}>{labels[key]}</p>
                        <ul className="flex flex-col gap-3">
                          {analysis[key].map((item, i) => (
                            <li key={i} className={`text-sm flex gap-2.5 leading-relaxed ${c.text}`}>
                              <span className={`${c.bullet} shrink-0 font-bold text-base leading-5`}>›</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Question review */}
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-sm font-bold text-white">Question Review</span>
                <div className="flex gap-3 text-xs text-zinc-500">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />{totalCorrect} correct</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{questions.filter(q => q.is_correct === false).length} incorrect</span>
                </div>
              </div>
              <div className="divide-y divide-zinc-800/60 max-h-72 overflow-y-auto">
                {Array.from({ length: totalQ }, (_, i) => {
                  const q = questions.find(qr => qr.order_index === i + 1);
                  const isEng = i < englishCount;
                  const correct = q?.is_correct;
                  return (
                    <div key={i} className={`flex items-center gap-3 px-4 py-2.5 border-l-[3px] ${
                      correct === true ? "border-emerald-500 bg-emerald-500/5"
                      : correct === false ? "border-red-500 bg-red-500/5"
                      : "border-zinc-700 bg-zinc-900"
                    }`}>
                      <span className="text-xs font-mono text-zinc-500 w-7 shrink-0">Q{i + 1}</span>
                      <div className="flex-1 flex items-center gap-1.5">
                        {correct === true ? (
                          <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : correct === false ? (
                          <svg className="w-3.5 h-3.5 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full border border-zinc-600 shrink-0" />
                        )}
                        <span className={`text-xs ${correct === true ? "text-emerald-400" : correct === false ? "text-red-400" : "text-zinc-600"}`}>
                          {correct === true ? "Correct" : correct === false ? "Incorrect" : "Skipped"}
                        </span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${isEng ? "bg-blue-500/10 text-blue-400" : "bg-violet-500/10 text-violet-400"}`}>
                        {isEng ? "ELA" : "Math"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
