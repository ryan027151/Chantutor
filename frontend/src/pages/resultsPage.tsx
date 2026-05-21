import { useEffect, useState, useContext } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabase-client";
import { UserContext } from "../components/userContext";
import { Test } from "../components/types";
import { computeSHSATScore, scoreLabel, type SHSATScore, type Difficulty, type ScoredQuestion } from "../utils/scoring";
import QuestionDetailModal from "../components/QuestionDetailModal";

interface QuestionResult {
  id: string;
  order_index: number;
  is_correct: boolean | null;
  student_answer: string | null;
}

interface SelectedQuestion {
  uid: string;
  studentAnswer: string | null;
  isCorrect: boolean | null;
  questionNumber: number;
}

interface AIAnalysis {
  strengths: string[];
  improvements: string[];
  recommendations: string[];
}

function ScoreCircle({ correct, total }: { correct: number; total: number }) {
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const color = pct >= 70 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative w-40 h-40 rounded-full"
        style={{ background: `conic-gradient(${color} ${pct}%, #e2e8f0 ${pct}%)` }}
      >
        <div className="absolute inset-3 bg-white rounded-full flex flex-col items-center justify-center gap-0.5">
          <span className="text-3xl font-bold text-slate-900">{pct}%</span>
          <span className="text-xs text-slate-400 font-medium">score</span>
        </div>
      </div>
      <p className="text-sm font-medium text-slate-500">{correct} / {total} correct</p>
    </div>
  );
}

function SectionBar({ label, correct, total, colorClass }: { label: string; correct: number; total: number; colorClass: string }) {
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-slate-400">{correct} / {total} &middot; {pct}%</span>
      </div>
      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ease-out ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AIShimmer() {
  return (
    <div className="flex flex-col gap-3 animate-pulse">
      <div className="h-4 bg-slate-200 rounded-full w-4/5" />
      <div className="h-4 bg-slate-200 rounded-full w-3/5" />
      <div className="h-4 bg-slate-200 rounded-full w-2/3" />
    </div>
  );
}

function AnalysisCard({ title, items, borderColor, bgColor, textColor, bulletColor }: {
  title: string; items: string[]; borderColor: string; bgColor: string; textColor: string; bulletColor: string;
}) {
  return (
    <div className={`border-l-4 rounded-r-xl p-4 ${borderColor} ${bgColor}`}>
      <p className={`text-xs font-bold uppercase tracking-wider mb-2.5 ${textColor}`}>{title}</p>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={i} className={`text-sm flex gap-2 ${textColor} opacity-90`}>
            <span className={`${bulletColor} mt-0.5 shrink-0`}>›</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SHSATScoreCard({ score }: { score: SHSATScore }) {
  const [expanded, setExpanded] = useState(false);
  const label = scoreLabel(score.total);
  const totalColorClass =
    label.color === "green" ? "text-emerald-600" :
    label.color === "amber" ? "text-amber-500" : "text-rose-500";
  const bannerClass =
    label.color === "green" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
    label.color === "amber" ? "bg-amber-50 text-amber-700 border-amber-100" :
    "bg-rose-50 text-rose-700 border-rose-100";

  const elaPct  = Math.round(score.elaRatio  * 100);
  const mathPct = Math.round(score.mathRatio * 100);

  const elaSubcats  = score.subcategories.filter(s => s.subject === "english");
  const mathSubcats = score.subcategories.filter(s => s.subject === "math");

  function subScoreColor(s: number) {
    if (s >= 580) return "text-emerald-600";
    if (s >= 450) return "text-amber-500";
    return "text-rose-500";
  }

  function subBarWidth(s: number) {
    return `${Math.round(((s - 200) / 500) * 100)}%`;
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-900">Estimated SHSAT Score</h2>
        <span className="text-xs text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200">
          Difficulty-weighted
        </span>
      </div>

      {/* Total score */}
      <div className="flex items-end justify-center gap-2">
        <span className={`text-6xl font-black tabular-nums ${totalColorClass}`}>{score.total}</span>
        <span className="text-2xl font-bold text-slate-300 mb-1">/700</span>
      </div>

      {/* Section ratios */}
      <div className="flex items-center justify-center gap-6">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xs font-medium text-slate-400">ELA</span>
          <span className="text-xl font-bold text-blue-600">{elaPct}%</span>
          <span className="text-xs text-slate-300">weighted</span>
        </div>
        <div className="w-px h-10 bg-slate-200" />
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xs font-medium text-slate-400">Math</span>
          <span className="text-xl font-bold text-violet-600">{mathPct}%</span>
          <span className="text-xs text-slate-300">weighted</span>
        </div>
      </div>

      <div className={`text-center text-sm font-medium rounded-xl py-2 px-3 border ${bannerClass}`}>
        {label.text}
      </div>

      {/* Subcategory breakdown toggle */}
      {score.subcategories.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="flex items-center justify-between w-full text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors pt-1 border-t border-slate-100"
          >
            <span>By subcategory</span>
            <svg
              className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
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
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{group.label}</p>
                    <div className="flex flex-col gap-2.5">
                      {group.list.map(sub => (
                        <div key={sub.name} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-600 font-medium">{sub.name}</span>
                            <span className={`font-bold tabular-nums ${subScoreColor(sub.score)}`}>
                              {sub.score}
                              <span className="text-slate-300 font-normal"> /700</span>
                              <span className="text-slate-400 font-normal ml-1.5">({sub.correct}/{sub.total})</span>
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${group.accent}`}
                              style={{ width: subBarWidth(sub.score) }}
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

function ResultsPage() {
  const { testID } = useParams();
  const user = useContext(UserContext);
  const navigate = useNavigate();
  const [test, setTest] = useState<Test | null>(null);
  const [questions, setQuestions] = useState<QuestionResult[]>([]);
  const [shsatScore, setShsatScore] = useState<SHSATScore | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiError, setAiError] = useState(false);
  const [selectedQ, setSelectedQ] = useState<SelectedQuestion | null>(null);

  useEffect(() => {
    if (!user || !testID) return;
    (async () => {
      const { data: testData } = await supabase
        .from("tests").select("*").eq("id", testID).eq("user_id", user.id).single();
      if (testData) setTest(testData as Test);

      const { data: qData } = await supabase
        .from("questions")
        .select("id, order_index, is_correct, student_answer")
        .eq("test_id", testID)
        .eq("user_id", user.id)
        .order("order_index", { ascending: true });
      if (qData) setQuestions(qData as QuestionResult[]);

      if (testData && qData && qData.length > 0) {
        const questionIds = (qData as QuestionResult[]).map(q => q.id).filter(Boolean);
        const englishCnt: number =
          testData.configuration?.english?.count ?? Math.floor(testData.total_questions / 2);

        const { data: detailData } = await supabase
          .from("all_questions")
          .select("uid, difficulty, sub_category, subject")
          .in("uid", questionIds);

        type Detail = { uid: string; difficulty: string; sub_category: string; subject: string };
        const detailMap: Record<string, Detail> = Object.fromEntries(
          (detailData ?? []).map((q: Detail) => [q.uid, q])
        );

        const scored: ScoredQuestion[] = (qData as QuestionResult[]).map(q => {
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
          body: { test_id: testID, user_id: user.id },
        });
        if (aiErr || !aiData) throw new Error();
        setAiAnalysis(aiData as AIAnalysis);
      } catch {
        setAiError(true);
      } finally {
        setAiLoading(false);
      }
    })();
  }, [user, testID]);

  if (!test) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <p className="text-slate-400 text-sm">Loading results…</p>
      </div>
    );
  }

  const englishCount = test.configuration?.english?.count ?? Math.floor(test.total_questions / 2);
  const mathCount    = test.configuration?.math?.count    ?? Math.ceil(test.total_questions / 2);
  const englishQs    = questions.filter(q => q.order_index <= englishCount);
  const mathQs       = questions.filter(q => q.order_index > englishCount);
  const totalCorrect = questions.filter(q => q.is_correct === true).length;
  const engCorrect   = englishQs.filter(q => q.is_correct === true).length;
  const mathCorrect  = mathQs.filter(q => q.is_correct === true).length;

  const fallbackAnalysis: AIAnalysis = {
    strengths: [
      engCorrect >= englishQs.length * 0.7 ? "Strong English/ELA performance" : "Consistent effort across all questions",
      mathCorrect >= mathQs.length * 0.7 ? "Solid math fundamentals" : "Good attempt on challenging content",
      `Completed ${questions.length} of ${test.total_questions} questions`,
    ],
    improvements: [
      engCorrect < englishQs.length * 0.7 ? "Focus on reading comprehension and grammar" : "Push for higher ELA accuracy",
      mathCorrect < mathQs.length * 0.7 ? "Review core math concepts and grid-in format" : "Target harder math problem types",
      "Revisit any questions answered incorrectly to spot patterns",
    ],
    recommendations: [
      "Practice with timed sessions to build test endurance",
      "Review explanations for all incorrect answers",
      "Spend extra study time on your lower-scoring section",
    ],
  };

  const analysis = aiAnalysis ?? (aiError ? fallbackAnalysis : null);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-100 shadow-sm px-6 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button
          type="button"
          onClick={() => navigate("/home")}
          className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="Back to home"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-base font-bold text-slate-900">{test.test_name}</h1>
          <p className="text-xs text-slate-400">
            {new Date(test.created_at).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-8 flex flex-col gap-5">
        {/* Raw score hero */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 flex flex-col items-center gap-7">
          <ScoreCircle correct={totalCorrect} total={test.total_questions} />
          <div className="w-full flex flex-col gap-4">
            <SectionBar label="English / ELA" correct={engCorrect} total={englishCount} colorClass="bg-blue-500" />
            <SectionBar label="Math"          correct={mathCorrect} total={mathCount}   colorClass="bg-violet-500" />
          </div>
        </div>

        {/* SHSAT Score Estimate */}
        {shsatScore && <SHSATScoreCard score={shsatScore} />}

        {/* AI Coach */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="font-bold text-slate-900">AI Coach</h2>
            <span className={`ml-auto text-xs rounded-full px-2.5 py-0.5 font-medium border ${
              aiLoading
                ? "text-slate-400 border-slate-200"
                : !aiError
                ? "text-blue-600 border-blue-200 bg-blue-50"
                : "text-amber-600 border-amber-200 bg-amber-50"
            }`}>
              {aiLoading ? "Analyzing…" : !aiError ? "Powered by Claude" : "Auto summary"}
            </span>
          </div>
          {aiLoading ? (
            <AIShimmer />
          ) : analysis ? (
            <div className="flex flex-col gap-3">
              <AnalysisCard title="Strengths"            items={analysis.strengths}       borderColor="border-emerald-400" bgColor="bg-emerald-50" textColor="text-emerald-800" bulletColor="text-emerald-500" />
              <AnalysisCard title="Areas to Improve"     items={analysis.improvements}    borderColor="border-amber-400"   bgColor="bg-amber-50"   textColor="text-amber-800"   bulletColor="text-amber-500"   />
              <AnalysisCard title="Study Recommendations" items={analysis.recommendations} borderColor="border-blue-400"    bgColor="bg-blue-50"    textColor="text-blue-800"    bulletColor="text-blue-500"    />
            </div>
          ) : null}
        </div>

        {/* Question review */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-900">Question Review</h2>
            <div className="flex gap-3 text-xs font-medium text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />{totalCorrect} correct</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />{questions.filter(q => q.is_correct === false).length} incorrect</span>
            </div>
          </div>
          <div className="divide-y divide-slate-50 max-h-112 overflow-y-auto">
            {Array.from({ length: test.total_questions }, (_, i) => {
              const q = questions.find(qr => qr.order_index === i + 1);
              const isEnglish = i + 1 <= englishCount;
              const correct = q?.is_correct;
              const clickable = !!q;
              const rowCls = `w-full text-left flex items-center gap-3 px-5 py-3 border-l-[3px] ${
                correct === true  ? "bg-emerald-50/60 border-emerald-400" :
                correct === false ? "bg-rose-50/60 border-rose-400" :
                "bg-slate-50/60 border-slate-200"
              } ${clickable ? "cursor-pointer hover:brightness-95" : ""}`;
              const inner = (
                <>
                  <span className="text-xs font-mono font-semibold text-slate-400 w-8 shrink-0">Q{i + 1}</span>
                  <div className="flex-1 flex items-center gap-1.5">
                    {correct === true ? (
                      <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    ) : correct === false ? (
                      <svg className="w-3.5 h-3.5 text-rose-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 shrink-0" />
                    )}
                    <span className={`text-xs font-medium ${correct === true ? "text-emerald-700" : correct === false ? "text-rose-600" : "text-slate-400"}`}>
                      {correct === true ? "Correct" : correct === false ? "Incorrect" : "Skipped"}
                    </span>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${isEnglish ? "bg-blue-50 text-blue-600" : "bg-violet-50 text-violet-600"}`}>
                    {isEnglish ? "ELA" : "Math"}
                  </span>
                  {clickable && (
                    <svg className="w-3.5 h-3.5 text-slate-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

      {selectedQ && (
        <QuestionDetailModal
          questionUid={selectedQ.uid}
          studentAnswer={selectedQ.studentAnswer}
          isCorrect={selectedQ.isCorrect}
          questionNumber={selectedQ.questionNumber}
          testId={testID}
          testName={test.test_name}
          onClose={() => setSelectedQ(null)}
        />
      )}
    </div>
  );
}

export default ResultsPage;
