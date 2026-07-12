import { useEffect, useState } from "react";
import { supabase } from "../supabase-client";
import { computeSHSATScore, scoreLabel, isRevisingEditing, type SHSATScore, type Difficulty, type ScoredQuestion } from "../utils/scoring";
import { useContext } from "react";
import { UserContext } from "./userContext";
import QuestionDetailModal from "./QuestionDetailModal";
import { exportResultsPDF } from "../utils/exportResultsPDF";
import { SUBCAT_TW, SCORE_BAND_TW, fmtSubEN, type Lang } from "../utils/translations";

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuestionResult { id: string; order_index: number; is_correct: boolean | null; student_answer: string | null; sub_category: string | null; subject: string | null; time_spent?: number | null; }
interface SelectedQuestion { uid: string; studentAnswer: string | null; isCorrect: boolean | null; questionNumber: number; }
interface AIAnalysis { strengths: string[]; improvements: string[]; recommendations: string[]; }
interface TestInfo {
  test_name: string; created_at: string; total_questions: number;
  configuration: Record<string, { count: number }> | null;
  duration?: number;
}

// ── Language ──────────────────────────────────────────────────────────────────

interface LangStrings {
  saveAsPDF: string; pdfGenerating: string;
  rawScore: string; correct: (n: number, m: number) => string;
  math: string; revisingEditing: string; readingComprehension: string;
  estimatedScore: string; diffWeighted: string; bySubcategory: string;
  performanceSummary: string;
  strengths: string; improvements: string; recommendations: string;
  questionReview: string;
  correctCount: (n: number) => string; incorrectCount: (n: number) => string;
  correctLabel: string; incorrectLabel: string; skippedLabel: string;
  unableToLoad: string;
  translateScore: (text: string) => string;
  translateSubcategory: (raw: string) => string;
  fallbackStrengths: (engGood: boolean, mathGood: boolean, done: number, total: number) => string[];
  fallbackImprovements: (engGood: boolean, mathGood: boolean) => string[];
  fallbackRecs: () => string[];
}


const T: Record<Lang, LangStrings> = {
  en: {
    saveAsPDF: "Save as PDF", pdfGenerating: "Generating…",
    rawScore: "score", correct: (n, m) => `${n} / ${m} correct`,
    math: "Math", revisingEditing: "Revising/Editing", readingComprehension: "Reading Comprehension",
    estimatedScore: "Estimated SHSAT Score", diffWeighted: "Difficulty-weighted", bySubcategory: "By subcategory",
    performanceSummary: "Performance Summary",
    strengths: "Strengths", improvements: "Areas to Improve", recommendations: "What to Do Next",
    questionReview: "Question Review",
    correctCount: (n) => `${n} correct`, incorrectCount: (n) => `${n} incorrect`,
    correctLabel: "Correct", incorrectLabel: "Incorrect", skippedLabel: "Skipped",
    unableToLoad: "Unable to load results.",
    translateScore: (text) => text,
    translateSubcategory: fmtSubEN,
    fallbackStrengths: (engGood, mathGood, done, total) => [
      engGood ? "Strong English performance overall" : "Consistent effort across sections",
      mathGood ? "Solid math fundamentals" : "Good attempt on challenging content",
      `Completed ${done} of ${total} questions`,
    ],
    fallbackImprovements: (engGood, mathGood) => [
      engGood ? "Push for higher English accuracy" : "Focus on Revising/Editing and Reading Comprehension",
      mathGood ? "Target harder math problems" : "Review core math concepts",
      "Revisit incorrectly answered questions",
    ],
    fallbackRecs: () => [
      "Practice with timed sessions to build endurance",
      "Review explanations for all incorrect answers",
      "Spend extra time on the lower-scoring section",
    ],
  },
  "zh-TW": {
    saveAsPDF: "儲存為 PDF", pdfGenerating: "生成中…",
    rawScore: "原始分數", correct: (n, m) => `${n} / ${m} 題答對`,
    math: "數學", revisingEditing: "修訂與編輯", readingComprehension: "閱讀理解",
    estimatedScore: "SHSAT 預估分數", diffWeighted: "難度加權", bySubcategory: "按子類別查看",
    performanceSummary: "學習表現摘要",
    strengths: "優勢", improvements: "待提升方向", recommendations: "學習建議",
    questionReview: "題目回顧",
    correctCount: (n) => `${n} 題正確`, incorrectCount: (n) => `${n} 題錯誤`,
    correctLabel: "正確", incorrectLabel: "錯誤", skippedLabel: "未作答",
    unableToLoad: "無法載入成績。",
    translateScore: (text) => SCORE_BAND_TW[text] ?? text,
    translateSubcategory: (raw) => SUBCAT_TW[raw] ?? fmtSubEN(raw),
    fallbackStrengths: (engGood, mathGood, done, total) => [
      engGood ? "語文表現整體良好" : "各科目均表現努力",
      mathGood ? "數學基礎紮實" : "挑戰性題目表現積極",
      `已完成 ${done} / ${total} 道題`,
    ],
    fallbackImprovements: (engGood, mathGood) => [
      engGood ? "追求更高的語文正確率" : "加強閱讀理解和語法練習",
      mathGood ? "挑戰更難的數學題目" : "複習核心數學知識",
      "重新審視答錯的題目",
    ],
    fallbackRecs: () => [
      "練習限時作答，培養考試耐力",
      "仔細閱讀所有錯題的解析",
      "將更多學習時間集中在分數較低的科目上",
    ],
  },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreCircle({ correct, total, t }: { correct: number; total: number; t: LangStrings }) {
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
          <span className="text-xs text-zinc-500">{t.rawScore}</span>
        </div>
      </div>
      <p className="text-xs text-zinc-500">{t.correct(correct, total)}</p>
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

const SHSAT_SECS = 10_800; // 3 h in seconds

function getSubTip(name: string): string {
  const MAP: Record<string, string> = {
    Vocabulary_in_Context: "Cover the word, predict what fits, then match to the answer choices.",
    Textual_Evidence: "Re-read the exact lines cited in the question before answering.",
    Central_Idea: "Summarize the whole passage in one sentence — that is the central idea.",
    Algebra_and_Equations: "Translate each word problem into one equation, then solve step-by-step.",
    Geometry: "Sketch the figure and label all known values before computing.",
    Arithmetic: "Review PEMDAS and practice quick fraction↔decimal conversions.",
    Percentage: "Part = Percent × Whole; percent change = (new − old) ÷ old × 100.",
    Comma_Usage: "Commas join independent clauses with a conjunction, follow introductory phrases, and separate list items.",
    Pronoun_Agreement: "Match each pronoun to its antecedent in number — 'everyone/each' is singular.",
    Sentence_Structure: "Identify subject + verb in each clause; fragments lack one, run-ons lack a separator.",
  };
  const key = name.replace(/[-\s]/g, "_");
  if (MAP[key]) return MAP[key];
  return `Drill focused sets of ${name.replace(/_/g, " ")} questions and review each error immediately.`;
}

function SHSATScoreCard({ score, t }: { score: SHSATScore; t: LangStrings }) {
  const [expanded, setExpanded] = useState(false);
  const label = scoreLabel(score.total);
  const totalColorClass =
    label.color === "green" ? "text-emerald-400" :
    label.color === "amber" ? "text-amber-400" : "text-rose-400";
  const bannerClass =
    label.color === "green" ? "bg-emerald-500/5 text-emerald-300 border-emerald-500/20" :
    label.color === "amber" ? "bg-amber-500/5 text-amber-300 border-amber-500/20" :
    "bg-rose-500/5 text-rose-300 border-rose-500/20";

  const revisingPct = Math.round(score.revisingRatio * 100);
  const readingPct  = Math.round(score.readingRatio  * 100);
  const mathPct     = Math.round(score.mathRatio     * 100);

  const revisingSubcats = score.subcategories.filter(s => s.subject === "english" && isRevisingEditing(s.name));
  const readingSubcats  = score.subcategories.filter(s => s.subject === "english" && !isRevisingEditing(s.name));
  const mathSubcats     = score.subcategories.filter(s => s.subject === "math");

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
        <span className="text-sm font-bold text-white">{t.estimatedScore}</span>
        <span className="text-xs text-zinc-500 bg-zinc-800 px-2.5 py-1 rounded-full border border-zinc-700">
          {t.diffWeighted}
        </span>
      </div>

      <div className="flex items-end justify-center gap-2">
        <span className={`text-5xl font-black tabular-nums ${totalColorClass}`}>{score.total}</span>
        <span className="text-xl font-bold text-zinc-700 mb-1">/700</span>
      </div>

      <div className="flex items-center justify-center gap-3">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xs text-zinc-500">{t.revisingEditing}</span>
          <span className="text-lg font-bold text-blue-400">{revisingPct}%</span>
        </div>
        <div className="w-px h-8 bg-zinc-700" />
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xs text-zinc-500">{t.readingComprehension}</span>
          <span className="text-lg font-bold text-sky-400">{readingPct}%</span>
        </div>
        <div className="w-px h-8 bg-zinc-700" />
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xs text-zinc-500">{t.math}</span>
          <span className="text-lg font-bold text-violet-400">{mathPct}%</span>
        </div>
      </div>

      <div className={`text-center text-xs font-medium rounded-lg py-2 px-3 border ${bannerClass}`}>
        {t.translateScore(label.text)}
      </div>

      {score.subcategories.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="flex items-center justify-between w-full text-xs font-semibold text-zinc-500 hover:text-zinc-300 transition-colors pt-1 border-t border-zinc-800"
          >
            <span>{t.bySubcategory}</span>
            <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expanded && (
            <div className="flex flex-col gap-4">
              {[
                { label: t.revisingEditing,      list: revisingSubcats, accent: "bg-blue-500"   },
                { label: t.readingComprehension, list: readingSubcats,  accent: "bg-sky-500"    },
                { label: t.math,                 list: mathSubcats,     accent: "bg-violet-500" },
              ].filter(g => g.list.length > 0).map(group => (
                <div key={group.label}>
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">{group.label}</p>
                  <div className="flex flex-col gap-2.5">
                    {group.list.map(sub => (
                      <div key={sub.name} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-400 font-medium">{t.translateSubcategory(sub.name)}</span>
                          <span className="text-zinc-500 font-normal">({sub.correct}/{sub.total})</span>
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

// ── Main component ────────────────────────────────────────────────────────────

interface ResultsModalProps {
  testID: string;
  userID: string;
  studentName?: string;
  onClose: () => void;
}

export default function ResultsModal({ testID, userID, studentName, onClose }: ResultsModalProps) {
  const currentUser = useContext(UserContext);
  const [test, setTest] = useState<TestInfo | null>(null);
  const [questions, setQuestions] = useState<QuestionResult[]>([]);
  const [shsatScore, setShsatScore] = useState<SHSATScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [selectedQ, setSelectedQ] = useState<SelectedQuestion | null>(null);
  const [lang, setLang] = useState<Lang>("en");

  const t = T[lang];

  useEffect(() => {
    (async () => {
      setLoading(true);

      type Detail = { uid: string; difficulty: string; sub_category: string; subject: string };
      let resolvedTest: TestInfo | null = null;
      let resolvedQs: QuestionResult[] = [];
      let detailMap: Record<string, Detail> = {};

      const isViewingOther = currentUser && currentUser.id !== userID;

      if (isViewingOther) {
        const { data: res } = await supabase.functions.invoke("get-student-performance", {
          body: { student_id: userID },
        });
        if (res) {
          type EdgeQ = { id: string; test_id: string; order_index: number; is_correct: boolean | null; student_answer?: string | null; difficulty: string | null; sub_category: string | null; subject: string | null };
          type EdgeTest = TestInfo & { id: string };
          const allQs = (res.questions ?? []) as EdgeQ[];
          const allTests = (res.tests ?? []) as EdgeTest[];
          resolvedQs = allQs.filter(q => q.test_id === testID).map(q => ({
            id: q.id, order_index: q.order_index, is_correct: q.is_correct, student_answer: q.student_answer ?? null,
            sub_category: q.sub_category ?? null, subject: q.subject ?? null,
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
        const [{ data: testData }, { data: qData }] = await Promise.all([
          supabase.from("tests").select("test_name, created_at, total_questions, configuration, duration").eq("id", testID).single(),
          supabase.from("questions").select("id, order_index, is_correct, student_answer, time_spent").eq("test_id", testID).eq("user_id", userID).order("order_index"),
        ]);
        resolvedTest = testData as TestInfo | null;
        resolvedQs = (qData as QuestionResult[]).map(q => ({ ...q, sub_category: null })) ?? [];

        if (resolvedQs.length > 0) {
          const questionIds = resolvedQs.map(q => q.id).filter(Boolean);
          const { data: detailData } = await supabase
            .from("all_questions")
            .select("uid, difficulty, sub_category, subject")
            .in("uid", questionIds);
          detailMap = Object.fromEntries(
            (detailData ?? []).map((q: Detail) => [q.uid, q])
          );
          resolvedQs = resolvedQs.map(q => ({
            ...q,
            sub_category: detailMap[q.id]?.sub_category ?? null,
            subject: detailMap[q.id]?.subject ?? null,
          }));
        }
      }

      // Compute SHSAT score synchronously before setting any state so all
      // data is ready in a single React render (no SHSAT card flicker).
      let shsat: SHSATScore | null = null;
      if (resolvedTest && resolvedQs.length > 0) {
        // Use actual subject field as primary source for the ELA/Math boundary;
        // fall back to configuration only when subject data is missing.
        const subjectEngCnt = resolvedQs.filter(q => q.subject === "english").length;
        const englishCnt: number = subjectEngCnt > 0
          ? subjectEngCnt
          : (resolvedTest.configuration?.english?.count ?? Math.floor(resolvedTest.total_questions / 2));
        const scored: ScoredQuestion[] = resolvedQs.map(q => {
          const d = detailMap[q.id];
          return {
            order_index:  q.order_index,
            is_correct:   q.is_correct,
            difficulty:   (d?.difficulty as Difficulty) ?? "medium",
            sub_category: d?.sub_category ?? q.sub_category ?? undefined,
            subject:      d?.subject ?? q.subject ?? undefined,
          };
        });
        shsat = computeSHSATScore(scored, englishCnt);
      }

      // Batch all state updates — React 18 auto-batches these in async context,
      // so the UI renders once with everything ready.
      if (resolvedTest) setTest(resolvedTest);
      setQuestions(resolvedQs);
      if (shsat) setShsatScore(shsat);
      setLoading(false);
    })();
  }, [testID, userID]);

  // Use subject field as the primary ELA/Math split; fall back to configuration
  // only when subject data is absent (older test records may lack it).
  const englishQs    = questions.filter(q => q.subject === "english");
  const mathQs       = questions.filter(q => q.subject === "math");
  const hasSubjects  = englishQs.length > 0 || mathQs.length > 0;
  const englishCount = hasSubjects
    ? englishQs.length
    : (test?.configuration?.english?.count ?? Math.floor((test?.total_questions ?? 0) / 2));
  const mathCount    = hasSubjects
    ? mathQs.length
    : (test?.configuration?.math?.count ?? Math.ceil((test?.total_questions ?? 0) / 2));
  const totalQ       = test?.total_questions ?? 0;

  const totalCorrect = questions.filter(q => q.is_correct === true).length;
  const engCorrect   = (hasSubjects ? englishQs : questions.filter(q => q.order_index <= englishCount))
    .filter(q => q.is_correct === true).length;
  const mathCorrect  = (hasSubjects ? mathQs : questions.filter(q => q.order_index > englishCount))
    .filter(q => q.is_correct === true).length;

  const engGood  = englishCount > 0 ? engCorrect >= englishCount * 0.7 : false;
  const mathGood = mathCount    > 0 ? mathCorrect >= mathCount    * 0.7 : false;

  // Personalized analysis based on subcategory data, pacing, and subject accuracy
  const timesArr = questions
    .map(q => q.time_spent)
    .filter((v): v is number => v != null && v >= 3 && v <= 600);
  const avgTimePerQ = timesArr.length >= 8
    ? timesArr.reduce((a, b) => a + b, 0) / timesArr.length
    : null;
  const budgetPerQ  = SHSAT_SECS / (test?.total_questions || 100);
  const budgetRound = Math.round(budgetPerQ);
  const avgRound    = avgTimePerQ != null ? Math.round(avgTimePerQ) : null;
  const pacingCritical = avgTimePerQ != null && avgTimePerQ > budgetPerQ * 1.5;
  const pacingWarning  = avgTimePerQ != null && avgTimePerQ > budgetPerQ * 1.1 && !pacingCritical;
  const pacingGood     = avgTimePerQ != null && avgTimePerQ <= budgetPerQ;

  const weakSubs   = (shsatScore?.subcategories ?? []).filter(s => s.total >= 2).slice(0, 2);
  const strongSubs = (shsatScore?.subcategories ?? []).filter(s => s.total >= 2).reverse().slice(0, 1);

  const strengths: string[] = [];
  const improvements: string[] = [];
  const recommendations: string[] = [];

  if (strongSubs.length > 0) {
    const best = strongSubs[0];
    strengths.push(`${fmtSubEN(best.name)} is a strength — ${Math.round((best.earned / best.max) * 100)}% on ${best.total} questions`);
  } else {
    strengths.push(engGood ? "Strong English performance overall" : mathGood ? "Solid math fundamentals" : "Consistent effort across all sections");
  }
  if (pacingGood && avgRound != null) {
    strengths.push(`Good pacing — ${avgRound}s per question, within the ${budgetRound}s budget`);
  } else {
    strengths.push(`Completed ${questions.length} of ${totalQ} questions`);
  }

  if (weakSubs.length > 0) {
    const w = weakSubs[0];
    improvements.push(`${fmtSubEN(w.name)} is the biggest gap — ${Math.round((w.earned / w.max) * 100)}% on ${w.total} questions`);
  } else {
    improvements.push(engGood ? "Push for higher Reading Comprehension accuracy" : "Focus on Revising/Editing and Reading Comprehension");
  }
  if (pacingCritical) {
    improvements.push(`Pacing is critical — ${avgRound}s/question vs ${budgetRound}s budget; risks running out of time on the actual SHSAT`);
  } else if (pacingWarning) {
    improvements.push(`Slightly over pace — ${avgRound}s/question; timed drills can help`);
  } else {
    improvements.push(mathGood ? "Target harder math problem types" : "Review core math concepts");
  }

  if (weakSubs.length > 0) {
    const w = weakSubs[0];
    recommendations.push(`Drill ${fmtSubEN(w.name)} in focused blocks: ${getSubTip(w.name)}`);
  } else {
    recommendations.push("Practice with timed sessions to maintain accuracy under time pressure");
  }
  if (pacingCritical || pacingWarning) {
    recommendations.push(`Set a ${budgetRound}s-per-question timer and complete 20 questions without going back — the fastest way to build test pace`);
  } else {
    recommendations.push("Re-read each incorrect explanation within 24 hours — same-day review doubles long-term retention");
  }
  recommendations.push("Spend extra study time on the lower-scoring section — targeted practice yields faster gains than mixed review");

  const analysis: AIAnalysis = { strengths, improvements, recommendations };

  function handleExportPDF() {
    if (!test) return;
    setPdfLoading(true);
    const sl = shsatScore ? scoreLabel(shsatScore.total) : null;
    exportResultsPDF({
      testName: test.test_name,
      date: new Date(test.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      duration: test.duration ?? 0,
      totalCorrect,
      totalQuestions: totalQ,
      englishCorrect: engCorrect,
      englishTotal: englishCount,
      mathCorrect,
      mathTotal: mathCount,
      studentName,

      lang,
      shsatScore: shsatScore && sl ? {
        total: shsatScore.total,
        elaRatio: shsatScore.elaRatio,
        mathRatio: shsatScore.mathRatio,
        revisingRatio: shsatScore.revisingRatio,
        readingRatio: shsatScore.readingRatio,
        labelText: sl.text,
        labelColor: sl.color,
        subcategories: shsatScore.subcategories,
      } : undefined,
      aiAnalysis: analysis ?? undefined,
      questions: questions.map(q => ({
        orderIndex: q.order_index,
        isCorrect: q.is_correct,
        isEnglish: q.subject === "english",
      })),
    }).finally(() => setPdfLoading(false));
  }

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-start justify-center overflow-y-auto p-3 sm:p-6">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-2xl my-auto flex flex-col">

        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            {/* Language toggle */}
            <div className="flex items-center gap-1 mb-2">
              {(["en", "zh-TW"] as const).map(l => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  className={`text-xs font-semibold px-2 py-0.5 rounded-md transition-colors border ${
                    lang === l
                      ? "bg-amber-500 text-zinc-950 border-amber-500"
                      : "text-zinc-500 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {l === "en" ? "EN" : "繁體"}
                </button>
              ))}
            </div>
            {studentName && <p className="text-xs text-zinc-500 font-medium">{studentName}</p>}
            <h2 className="text-sm font-bold text-white">{test?.test_name ?? "Results"}</h2>
            {test && (
              <p className="text-xs text-zinc-600 mt-0.5">
                {new Date(test.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!loading && test && (
              <button
                type="button"
                onClick={handleExportPDF}
                disabled={pdfLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700 transition-colors disabled:opacity-50"
              >
                {pdfLoading ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
                {pdfLoading ? t.pdfGenerating : t.saveAsPDF}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !test ? (
          <div className="py-16 text-center text-zinc-500 text-sm">{t.unableToLoad}</div>
        ) : (
          <div className="p-6 flex flex-col gap-5 overflow-y-auto">

            {/* Raw score + section bars */}
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 flex flex-col gap-5">
              <ScoreCircle correct={totalCorrect} total={totalQ} t={t} />
              <div className="flex flex-col gap-3">
                {(() => {
                  const engQs   = hasSubjects ? englishQs : questions.filter(q => q.order_index <= englishCount);
                  const revQs   = engQs.filter(q => isRevisingEditing(q.sub_category));
                  const rcQs    = engQs.filter(q => !isRevisingEditing(q.sub_category));
                  const revCorr = revQs.filter(q => q.is_correct === true).length;
                  const rcCorr  = rcQs.filter(q => q.is_correct === true).length;
                  return (
                    <>
                      {revQs.length > 0 && <SectionBar label={t.revisingEditing}      correct={revCorr}     total={revQs.length} colorClass="bg-blue-500" />}
                      {rcQs.length  > 0 && <SectionBar label={t.readingComprehension} correct={rcCorr}      total={rcQs.length}  colorClass="bg-sky-500"  />}
                      {mathCount    > 0 && <SectionBar label={t.math}                 correct={mathCorrect} total={mathCount}    colorClass="bg-violet-500" />}
                    </>
                  );
                })()}
              </div>
            </div>

            {/* SHSAT Score Estimate — not shown for practice sessions */}
            {shsatScore && test?.test_name !== "Practice" && <SHSATScoreCard score={shsatScore} t={t} />}

            {/* Performance Summary */}
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                  <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <span className="text-sm font-bold text-white">{t.performanceSummary}</span>
              </div>
              <div className="flex flex-col gap-3">
                {(["strengths", "improvements", "recommendations"] as const).map(key => {
                  const labels: Record<typeof key, string> = {
                    strengths: t.strengths,
                    improvements: t.improvements,
                    recommendations: t.recommendations,
                  };
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
            </div>

            {/* Question review */}
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-sm font-bold text-white">{t.questionReview}</span>
                <div className="flex gap-3 text-xs text-zinc-500">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />{t.correctCount(totalCorrect)}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{t.incorrectCount(questions.filter(q => q.is_correct === false).length)}</span>
                </div>
              </div>
              <div className="divide-y divide-zinc-800/60 max-h-72 overflow-y-auto">
                {Array.from({ length: totalQ }, (_, i) => {
                  const q = questions.find(qr => qr.order_index === i + 1);
                  const isEng = q ? q.subject === "english" : i + 1 <= englishCount;
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
                          {correct === true ? t.correctLabel : correct === false ? t.incorrectLabel : t.skippedLabel}
                        </span>
                      </div>
                      {isEng ? (
                        isRevisingEditing(q?.sub_category)
                          ? <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-blue-500/10 text-blue-400">{t.revisingEditing}</span>
                          : <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-sky-500/10 text-sky-400">{t.readingComprehension}</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-violet-500/10 text-violet-400">{t.math}</span>
                      )}
                      {q?.sub_category && (
                        <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-zinc-800 text-zinc-400">
                          {t.translateSubcategory(q.sub_category)}
                        </span>
                      )}
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
