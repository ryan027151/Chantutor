import { useEffect, useState } from "react";
import { supabase } from "../supabase-client";
import { computeSHSATScore, scoreLabel, type SHSATScore, type Difficulty, type ScoredQuestion } from "../utils/scoring";
import { useContext } from "react";
import { UserContext } from "./userContext";
import QuestionDetailModal from "./QuestionDetailModal";

interface QuestionResult { id: string; order_index: number; is_correct: boolean | null; student_answer: string | null; }
interface SelectedQuestion { uid: string; studentAnswer: string | null; isCorrect: boolean | null; questionNumber: number; }
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

function SHSATScoreCard({ score }: { score: SHSATScore }) {
  const [expanded, setExpanded] = useState(false);
  const label = scoreLabel(score.total);
  const totalColorClass =
    label.color === "green" ? "text-emerald-400" :
    label.color === "amber" ? "text-amber-400" : "text-rose-400";
  const bannerClass =
    label.color === "green" ? "bg-emerald-500/5 text-emerald-300 border-emerald-500/20" :
    label.color === "amber" ? "bg-amber-500/5 text-amber-300 border-amber-500/20" :
    "bg-rose-500/5 text-rose-300 border-rose-500/20";

  const elaPct  = Math.round(score.elaRatio  * 100);
  const mathPct = Math.round(score.mathRatio * 100);

  const elaSubcats  = score.subcategories.filter(s => s.subject === "english");
  const mathSubcats = score.subcategories.filter(s => s.subject === "math");

  function subScoreColor(s: number) {
    if (s >= 580) return "text-emerald-400";
    if (s >= 450) return "text-amber-400";
    return "text-rose-400";
  }

  function subBarPct(s: number) {
    return `${Math.round(((s - 200) / 500) * 100)}%`;
  }

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-white">Estimated SHSAT Score</span>
        <span className="text-xs text-zinc-500 bg-zinc-800 px-2.5 py-1 rounded-full border border-zinc-700">
          Difficulty-weighted
        </span>
      </div>

      <div className="flex items-end justify-center gap-2">
        <span className={`text-5xl font-black tabular-nums ${totalColorClass}`}>{score.total}</span>
        <span className="text-xl font-bold text-zinc-700 mb-1">/700</span>
      </div>

      <div className="flex items-center justify-center gap-6">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xs text-zinc-500">ELA</span>
          <span className="text-lg font-bold text-blue-400">{elaPct}%</span>
          <span className="text-xs text-zinc-600">weighted</span>
        </div>
        <div className="w-px h-8 bg-zinc-700" />
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xs text-zinc-500">Math</span>
          <span className="text-lg font-bold text-violet-400">{mathPct}%</span>
          <span className="text-xs text-zinc-600">weighted</span>
        </div>
      </div>

      <div className={`text-center text-xs font-medium rounded-lg py-2 px-3 border ${bannerClass}`}>
        {label.text}
      </div>

      {/* Subcategory breakdown */}
      {score.subcategories.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="flex items-center justify-between w-full text-xs font-semibold text-zinc-500 hover:text-zinc-300 transition-colors pt-1 border-t border-zinc-800"
          >
            <span>By subcategory</span>
            <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expanded && (
            <div className="flex flex-col gap-4">
              {[{ label: "English / ELA", list: elaSubcats, accent: "bg-blue-500" },
                { label: "Math",          list: mathSubcats, accent: "bg-violet-500" }]
                .filter(g => g.list.length > 0)
                .map(group => (
                  <div key={group.label}>
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">{group.label}</p>
                    <div className="flex flex-col gap-2.5">
                      {group.list.map(sub => (
                        <div key={sub.name} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-zinc-400 font-medium">{sub.name}</span>
                            <span className={`font-bold tabular-nums ${subScoreColor(sub.score)}`}>
                              {sub.score}
                              <span className="text-zinc-600 font-normal"> /700</span>
                              <span className="text-zinc-500 font-normal ml-1.5">({sub.correct}/{sub.total})</span>
                            </span>
                          </div>
                          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${group.accent}`}
                              style={{ width: subBarPct(sub.score) }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </>
      )}
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
  const currentUser = useContext(UserContext);
  const [test, setTest] = useState<TestInfo | null>(null);
  const [questions, setQuestions] = useState<QuestionResult[]>([]);
  const [shsatScore, setShsatScore] = useState<SHSATScore | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiError, setAiError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedQ, setSelectedQ] = useState<SelectedQuestion | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);

      type Detail = { uid: string; difficulty: string; sub_category: string; subject: string };
      let resolvedTest: TestInfo | null = null;
      let resolvedQs: QuestionResult[] = [];
      let detailMap: Record<string, Detail> = {};

      const isViewingOther = currentUser && currentUser.id !== userID;

      if (isViewingOther) {
        // Admin / parent path: use edge function to bypass RLS
        const { data: res } = await supabase.functions.invoke("get-student-performance", {
          body: { student_id: userID },
        });
        if (res) {
          type EdgeQ = { id: string; test_id: string; order_index: number; is_correct: boolean | null; difficulty: string | null; sub_category: string | null; subject: string | null };
          type EdgeTest = TestInfo & { id: string };
          const allQs = (res.questions ?? []) as EdgeQ[];
          const allTests = (res.tests ?? []) as EdgeTest[];
          resolvedQs = allQs.filter(q => q.test_id === testID).map(q => ({
            id: q.id, order_index: q.order_index, is_correct: q.is_correct, student_answer: q.student_answer ?? null,
          }));
          resolvedTest = allTests.find(t => t.id === testID) ?? null;
          detailMap = Object.fromEntries(
            allQs.filter(q => q.test_id === testID).map(q => [q.id, {
              uid: q.id,
              difficulty: q.difficulty ?? "medium",
              sub_category: q.sub_category ?? "",
              subject: q.subject ?? "",
            }])
          );
        }
      } else {
        // Student path: direct queries
        const [{ data: testData }, { data: qData }] = await Promise.all([
          supabase.from("tests").select("test_name, created_at, total_questions, configuration").eq("id", testID).single(),
          supabase.from("questions").select("id, order_index, is_correct, student_answer").eq("test_id", testID).eq("user_id", userID).order("order_index"),
        ]);
        resolvedTest = testData as TestInfo | null;
        resolvedQs = (qData as QuestionResult[]) ?? [];

        if (resolvedQs.length > 0) {
          const questionIds = resolvedQs.map(q => q.id).filter(Boolean);
          const { data: detailData } = await supabase
            .from("all_questions")
            .select("uid, difficulty, sub_category, subject")
            .in("uid", questionIds);
          detailMap = Object.fromEntries(
            (detailData ?? []).map((q: Detail) => [q.uid, q])
          );
        }
      }

      if (resolvedTest) setTest(resolvedTest);
      setQuestions(resolvedQs);
      setLoading(false);

      if (resolvedTest && resolvedQs.length > 0) {
        const englishCnt: number =
          resolvedTest.configuration?.english?.count ?? Math.floor(resolvedTest.total_questions / 2);
        const scored: ScoredQuestion[] = resolvedQs.map(q => {
          const d = detailMap[q.id];
          return {
            order_index:  q.order_index,
            is_correct:   q.is_correct,
            difficulty:   (d?.difficulty as Difficulty) ?? "medium",
            sub_category: d?.sub_category,
            subject:      d?.subject,
          };
        });
        setShsatScore(computeSHSATScore(scored, englishCnt));
      }

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
  const engCorrect   = questions.filter(q => q.order_index <= englishCount && q.is_correct === true).length;
  const mathCorrect  = questions.filter(q => q.order_index > englishCount && q.is_correct === true).length;

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

            {/* Raw score + section bars */}
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 flex flex-col gap-5">
              <ScoreCircle correct={totalCorrect} total={totalQ} />
              <div className="flex flex-col gap-3">
                <SectionBar label="English / ELA" correct={engCorrect} total={englishCount} colorClass="bg-blue-500" />
                <SectionBar label="Math"           correct={mathCorrect} total={mathCount}   colorClass="bg-violet-500" />
              </div>
            </div>

            {/* SHSAT Score Estimate */}
            {shsatScore && <SHSATScoreCard score={shsatScore} />}

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
                  const isEng = i + 1 <= englishCount;
                  const correct = q?.is_correct;
                  const clickable = !!q;
                  const rowCls = `w-full text-left flex items-center gap-3 px-4 py-2.5 border-l-[3px] ${
                    correct === true  ? "border-emerald-500 bg-emerald-500/5" :
                    correct === false ? "border-red-500 bg-red-500/5" :
                    "border-zinc-700 bg-zinc-900"
                  } ${clickable ? "cursor-pointer hover:brightness-110" : ""}`;
                  const inner = (
                    <>
                      <span className="text-xs font-mono text-zinc-500 w-7 shrink-0">Q{i + 1}</span>
                      <div className="flex-1 flex items-center gap-1.5">
                        {correct === true ? (
                          <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                        ) : correct === false ? (
                          <svg className="w-3.5 h-3.5 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
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
                      {clickable && (
                        <svg className="w-3 h-3 text-zinc-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </>
                  );
                  return clickable ? (
                    <button
                      key={i}
                      type="button"
                      className={rowCls}
                      onClick={() => setSelectedQ({ uid: q.id, studentAnswer: q.student_answer, isCorrect: q.is_correct, questionNumber: i + 1 })}
                    >
                      {inner}
                    </button>
                  ) : (
                    <div key={i} className={rowCls}>{inner}</div>
                  );
                })}
              </div>
            </div>

          </div>
        )}
      </div>

      {selectedQ && (
        <QuestionDetailModal
          questionUid={selectedQ.uid}
          studentAnswer={selectedQ.studentAnswer}
          isCorrect={selectedQ.isCorrect}
          questionNumber={selectedQ.questionNumber}
          testId={testID}
          testName={test?.test_name}
          onClose={() => setSelectedQ(null)}
        />
      )}
    </div>
  );
}
