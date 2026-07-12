import { useEffect, useState, useContext } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabase-client";
import { UserContext } from "../components/userContext";
import { Test } from "../components/types";
import { computeSHSATScore, scoreLabel, isRevisingEditing, type SHSATScore, type Difficulty, type ScoredQuestion } from "../utils/scoring";
import QuestionDetailModal from "../components/QuestionDetailModal";
import { exportResultsPDF } from "../utils/exportResultsPDF";
import { SCORE_BAND_TW, fmtSubLocalized, type Lang } from "../utils/translations";

interface QuestionResult {
  id: string;
  order_index: number;
  is_correct: boolean | null;
  student_answer: string | null;
  sub_category: string | null;
  subject: string | null;
  time_spent: number | null;
  difficulty: string | null;
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

const SHSAT_SECS = 10_800; // 3 h in seconds

// Short actionable tip for a subcategory (used in personalized analysis)
function getSubTip(name: string): string {
  const MAP: Record<string, string> = {
    Vocabulary_in_Context:            "Cover the word, predict what fits from context, then match to the choices.",
    Textual_Evidence:                 "Find the exact lines cited in the question and re-read that paragraph before choosing.",
    Textual_Evidence_and_Reasoning:   "Identify the claim, find the supporting evidence, then check the logical link between them.",
    Central_Idea:                     "Summarize the whole passage in one sentence — that is your central idea.",
    Main_Idea:                        "The main idea appears in the topic sentence. Eliminate answers that are too specific.",
    Inference_and_Implied_Ideas:      "Work only from what the text says. Avoid over-inferring beyond what is directly supported.",
    Authors_Purpose:                  "Ask whether the author is informing, persuading, or entertaining — signal words reveal the purpose.",
    Figurative_Language:              "Name the device first (simile/metaphor/personification), then explain what is being compared.",
    Summarization:                    "Include only the main idea and key support — cut minor details and repeated information.",
    Text_Structure:                   "Look for signal words: 'however' (contrast), 'therefore' (cause-effect), 'first/then' (sequence).",
    Comma_Usage:                      "Commas join independent clauses with a conjunction, follow introductory phrases, and separate list items.",
    Pronoun_Agreement:                "Match each pronoun to its antecedent in number. 'Everyone/each/either' = singular.",
    Sentence_Structure:               "Identify the subject + verb in each clause — fragments lack one, run-ons lack punctuation between them.",
    Verb_Tense:                       "Keep tense consistent unless the time frame changes. Past-perfect ('had done') marks action before another past event.",
    Algebra_and_Equations:            "Translate each word problem into one equation before solving. Substitute back to verify.",
    Algebraic_Expressions:            "Distribute carefully — distributing a negative flips all signs inside the parentheses.",
    Geometry:                         "Sketch the figure and label what you know before computing. Key: area of triangle = ½bh.",
    Arithmetic:                       "Review PEMDAS order-of-operations and practice quick fraction↔decimal conversions.",
    Percentage:                       "Part = Percent × Whole. Percent change = (new − old) ÷ old × 100.",
    Ratios_and_Proportions:           "Write ratios as fractions and cross-multiply. For part-to-part ratios, find the total parts first.",
    Probability:                      "P(event) = favorable ÷ total outcomes. For independent events, multiply; for 'or' (mutually exclusive), add.",
    Stats_and_Data_Analysis:          "Mean = sum ÷ count. Median = middle after sorting. Always read chart axis labels before answering.",
    Fraction_Word_Problems:           "Draw a bar model. Find a common denominator before adding/subtracting; multiply across when multiplying.",
    "Linear_Eq._Formula":             "Slope-intercept: y = mx + b. Slope = (y₂−y₁)/(x₂−x₁). Use two points to build the equation.",
  };
  const key = name.replace(/[-\s]/g, "_");
  if (MAP[key]) return MAP[key];
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(MAP)) {
    if (lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower)) return v;
  }
  return `Drill focused sets of ${name.replace(/_/g, " ")} questions and review every error immediately after each set.`;
}

function ScoreCircle({ correct, total, lang }: { correct: number; total: number; lang: Lang }) {
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const color = pct >= 70 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444";
  const zh = lang === "zh-TW";
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative w-40 h-40 rounded-full"
        style={{ background: `conic-gradient(${color} ${pct}%, #e2e8f0 ${pct}%)` }}
      >
        <div className="absolute inset-3 bg-white rounded-full flex flex-col items-center justify-center gap-0.5">
          <span className="text-3xl font-bold text-slate-900">{pct}%</span>
          <span className="text-xs text-slate-400 font-medium">{zh ? "分數" : "score"}</span>
        </div>
      </div>
      <p className="text-sm font-medium text-slate-500">{correct} / {total} {zh ? "題答對" : "correct"}</p>
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

function SHSATScoreCard({ score, lang }: { score: SHSATScore; lang: Lang }) {
  const zh = lang === "zh-TW";
  const [expanded, setExpanded] = useState(false);
  const label = scoreLabel(score.total);
  const totalColorClass =
    label.color === "green" ? "text-emerald-600" :
    label.color === "amber" ? "text-amber-500" : "text-rose-500";
  const bannerClass =
    label.color === "green" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
    label.color === "amber" ? "bg-amber-50 text-amber-700 border-amber-100" :
    "bg-rose-50 text-rose-700 border-rose-100";

  const revisingPct = Math.round(score.revisingRatio * 100);
  const readingPct  = Math.round(score.readingRatio  * 100);
  const mathPct     = Math.round(score.mathRatio     * 100);

  const revisingSubcats = score.subcategories.filter(s => s.subject === "english" && isRevisingEditing(s.name));
  const readingSubcats  = score.subcategories.filter(s => s.subject === "english" && !isRevisingEditing(s.name));
  const mathSubcats     = score.subcategories.filter(s => s.subject === "math");

  function subScoreColor(s: number) {
    if (s >= 580) return "text-emerald-600";
    if (s >= 450) return "text-amber-500";
    return "text-rose-500";
  }

  function subBarWidth(s: number) {
    return `${Math.round(((s - 200) / 500) * 100)}%`;
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold text-slate-900">{zh ? "SHSAT 預估分數" : "Estimated SHSAT Score"}</h2>
        <span className="text-xs text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200">
          {zh ? "難度加權" : "Difficulty-weighted"}
        </span>
      </div>

      {/* Total score */}
      <div className="flex items-end justify-center gap-2">
        <span className={`text-6xl font-black tabular-nums ${totalColorClass}`}>{score.total}</span>
        <span className="text-2xl font-bold text-slate-300 mb-1">/700</span>
      </div>

      {/* Section ratios */}
      <div className="flex items-center justify-center flex-wrap gap-3 sm:gap-4">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xs font-medium text-slate-400">{zh ? "修訂/編輯" : "Rev/Edit"}</span>
          <span className="text-xl font-bold text-blue-600">{revisingPct}%</span>
          <span className="text-xs text-slate-300">{zh ? "加權" : "weighted"}</span>
        </div>
        <div className="w-px h-10 bg-slate-200" />
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xs font-medium text-slate-400">{zh ? "閱讀理解" : "Reading"}</span>
          <span className="text-xl font-bold text-sky-600">{readingPct}%</span>
          <span className="text-xs text-slate-300">{zh ? "加權" : "weighted"}</span>
        </div>
        <div className="w-px h-10 bg-slate-200" />
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xs font-medium text-slate-400">{zh ? "數學" : "Math"}</span>
          <span className="text-xl font-bold text-violet-600">{mathPct}%</span>
          <span className="text-xs text-slate-300">{zh ? "加權" : "weighted"}</span>
        </div>
      </div>

      <div className={`text-center text-sm font-medium rounded-xl py-2 px-3 border ${bannerClass}`}>
        {zh ? (SCORE_BAND_TW[label.text] ?? label.text) : label.text}
      </div>

      {/* Subcategory breakdown toggle */}
      {score.subcategories.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="flex items-center justify-between w-full text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors pt-1 border-t border-slate-100"
          >
            <span>{zh ? "按子類別查看" : "By subcategory"}</span>
            <svg
              className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expanded && (
            <div className="flex flex-col gap-4">
              {[{ label: zh ? "修訂與編輯" : "Revising / Editing",    list: revisingSubcats, accent: "bg-blue-500"   },
                { label: zh ? "閱讀理解" : "Reading Comprehension",   list: readingSubcats,  accent: "bg-sky-500"    },
                { label: zh ? "數學" : "Math",                         list: mathSubcats,     accent: "bg-violet-500" }]
                .filter(g => g.list.length > 0)
                .map(group => (
                  <div key={group.label}>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{group.label}</p>
                    <div className="flex flex-col gap-2.5">
                      {group.list.map((sub: { name: string; score: number; correct: number; total: number }) => (
                        <div key={sub.name} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-600 font-medium">{fmtSubLocalized(sub.name, lang)}</span>
                            <span className="text-slate-400 font-normal">({sub.correct}/{sub.total})</span>
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
  const [lang, setLang] = useState<Lang>("en");
  const [test, setTest] = useState<Test | null>(null);
  const [questions, setQuestions] = useState<QuestionResult[]>([]);
  const [shsatScore, setShsatScore] = useState<SHSATScore | null>(null);
  const [selectedQ, setSelectedQ] = useState<SelectedQuestion | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const t = (en: string, zh: string) => lang === "zh-TW" ? zh : en;

  useEffect(() => {
    if (!user || !testID) return;
    (async () => {
      // Query by test ID only — test IDs are per-student UUIDs, user_id filter is not needed
      // and would fail for admin viewing (admin uid ≠ student uid).
      const { data: testData } = await supabase
        .from("tests").select("*").eq("id", testID).single();
      if (testData) setTest(testData as Test);

      const { data: qData } = await supabase
        .from("questions")
        .select("id, order_index, is_correct, student_answer, time_spent")
        .eq("test_id", testID)
        .order("order_index", { ascending: true });

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

        setQuestions((qData as QuestionResult[]).map(q => ({
          ...q,
          sub_category: detailMap[q.id]?.sub_category ?? null,
          subject:      detailMap[q.id]?.subject ?? null,
          difficulty:   detailMap[q.id]?.difficulty ?? null,
        })));

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
      } else if (qData) {
        setQuestions((qData as QuestionResult[]).map(q => ({ ...q, sub_category: null })));
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
  const englishQs    = questions.filter(q => (q.subject ?? "").toLowerCase() === "english");
  const mathQs       = questions.filter(q => (q.subject ?? "").toLowerCase() !== "english" && q.subject != null);
  const totalCorrect = questions.filter(q => q.is_correct === true).length;
  const engCorrect   = englishQs.filter(q => q.is_correct === true).length;
  const mathCorrect  = mathQs.filter(q => q.is_correct === true).length;

  // Split ELA into Revising/Editing and Reading Comprehension
  const revisingQs      = englishQs.filter(q => isRevisingEditing(q.sub_category));
  const readingQs       = englishQs.filter(q => !isRevisingEditing(q.sub_category));
  const revisingCorrect = revisingQs.filter(q => q.is_correct === true).length;
  const readingCorrect  = readingQs.filter(q => q.is_correct === true).length;

  // ── Personalized analysis ──────────────────────────────────────────────────
  const timesArr = questions
    .map(q => q.time_spent)
    .filter((t): t is number => t != null && t >= 3 && t <= 600);
  const avgTimePerQ = timesArr.length >= 8
    ? timesArr.reduce((a, b) => a + b, 0) / timesArr.length
    : null;
  const budgetPerQ = SHSAT_SECS / (test.total_questions || 100);
  const budgetRound = Math.round(budgetPerQ);
  const avgRound = avgTimePerQ != null ? Math.round(avgTimePerQ) : null;
  const pacingCritical = avgTimePerQ != null && avgTimePerQ > budgetPerQ * 1.5;
  const pacingWarning  = avgTimePerQ != null && avgTimePerQ > budgetPerQ * 1.1 && !pacingCritical;
  const pacingGood     = avgTimePerQ != null && avgTimePerQ <= budgetPerQ;

  // Weakest subcategories sorted weakest-first (scoring.ts already sorts this way)
  const weakSubs  = (shsatScore?.subcategories ?? []).filter(s => s.total >= 2).slice(0, 3);
  const strongSubs = (shsatScore?.subcategories ?? []).filter(s => s.total >= 2).reverse().slice(0, 2);
  const zh = lang === "zh-TW";

  const strengths: string[] = [];
  const improvements: string[] = [];
  const recommendations: string[] = [];

  // Strengths
  if (strongSubs.length > 0) {
    const best = strongSubs[0];
    const pct = Math.round((best.earned / best.max) * 100);
    strengths.push(zh
      ? `${best.name} 表現突出，加權正確率 ${pct}%（${best.total} 題）`
      : `${fmtSubLocalized(best.name, "en")} is a real strength — ${pct}% weighted accuracy on ${best.total} questions`);
  } else if (engCorrect >= englishQs.length * 0.7) {
    strengths.push(zh ? "英文部分整體表現良好" : `English is solid at ${Math.round(engCorrect / Math.max(englishQs.length, 1) * 100)}% accuracy`);
  } else if (mathCorrect >= mathQs.length * 0.7) {
    strengths.push(zh ? "數學部分整體表現良好" : `Math is solid at ${Math.round(mathCorrect / Math.max(mathQs.length, 1) * 100)}% accuracy`);
  } else {
    strengths.push(zh ? "持續作答每一題，正在建立考試耐力" : "Pushed through every question — building real test stamina");
  }
  if (pacingGood && avgRound != null) {
    strengths.push(zh
      ? `作答節奏穩定（平均 ${avgRound}s/題，預算 ${budgetRound}s）`
      : `Great pacing — averaged ${avgRound}s per question, within the ${budgetRound}s budget`);
  } else if (strongSubs.length > 1) {
    const s2 = strongSubs[1];
    const pct2 = Math.round((s2.earned / s2.max) * 100);
    strengths.push(zh
      ? `${s2.name} 同樣紮實，加權正確率 ${pct2}%`
      : `${fmtSubLocalized(s2.name, "en")} also solid — ${pct2}% weighted accuracy`);
  } else {
    strengths.push(zh
      ? `完成 ${questions.length} 題作答，對題型已有完整接觸`
      : `Completed all ${questions.length} questions — full exposure to every question type`);
  }

  // Improvements
  if (weakSubs.length > 0) {
    const worst = weakSubs[0];
    const pct = Math.round((worst.earned / worst.max) * 100);
    improvements.push(zh
      ? `${worst.name} 是最大弱點：加權正確率僅 ${pct}%（${worst.total} 題）`
      : `${fmtSubLocalized(worst.name, "en")} is the biggest gap — ${pct}% weighted accuracy on ${worst.total} questions`);
  }
  if (weakSubs.length > 1) {
    const w2 = weakSubs[1];
    const pct2 = Math.round((w2.earned / w2.max) * 100);
    improvements.push(zh
      ? `${w2.name} 同樣需要加強：${pct2}% 正確率（${w2.total} 題）`
      : `${fmtSubLocalized(w2.name, "en")} also needs work — ${pct2}% accuracy on ${w2.total} questions`);
  }
  if (pacingCritical) {
    improvements.push(zh
      ? `作答速度嚴重偏慢（平均 ${avgRound}s/題 vs ${budgetRound}s 預算）——正式考試有未完成所有題目的風險`
      : `Pacing is critical — ${avgRound}s/question vs ${budgetRound}s budget; at this speed you risk not finishing the actual SHSAT`);
  } else if (pacingWarning) {
    improvements.push(zh
      ? `作答節奏稍慢（平均 ${avgRound}s/題）——接近預算邊界，練習計時可有效改善`
      : `Slightly over pace — ${avgRound}s/question against a ${budgetRound}s budget; consistent timed practice can close this gap`);
  }
  while (improvements.length < 2) {
    if (revisingQs.length > 0 && revisingCorrect / revisingQs.length < 0.7)
      improvements.push(zh ? "文法修訂題正確率低於 70%，加強基礎語法規則" : `Revising/Editing at ${Math.round(revisingCorrect / revisingQs.length * 100)}% — grammar patterns here are predictable and yield fast gains`);
    else if (mathQs.length > 0 && mathCorrect / mathQs.length < 0.7)
      improvements.push(zh ? "數學正確率低於 70%，優先複習代數與比例" : `Math at ${Math.round(mathCorrect / Math.max(mathQs.length, 1) * 100)}% — prioritize Algebra and Ratios/Proportions (highest question count)`);
    else
      improvements.push(zh ? "仍有部分題型有進步空間" : "Some harder question types still have room for improvement");
    break;
  }

  // Recommendations
  if (weakSubs.length > 0) {
    const w = weakSubs[0];
    recommendations.push(zh
      ? `針對 ${w.name} 進行 20 題集中練習——研究顯示單一主題集中練習比混合練習效率高出 40%。訣竅：${getSubTip(w.name)}`
      : `Drill ${fmtSubLocalized(w.name, "en")} in focused blocks — single-topic practice is ~40% more efficient than mixed sets. Key tip: ${getSubTip(w.name)}`);
  }
  if (pacingCritical || pacingWarning) {
    recommendations.push(zh
      ? `設定每題 ${budgetRound}s 計時器，完成 20 題不回頭修改——計時訓練是建立作答節奏最快的方法`
      : `Set a ${budgetRound}s-per-question timer and complete 20 questions without going back — timed repetition builds pace faster than any other method`);
  } else {
    recommendations.push(zh
      ? `在 24 小時內重新閱讀每道錯題的解析——間隔重複研究顯示，當天複習的記憶保留率是隔天的兩倍`
      : `Re-read each incorrect answer's explanation within 24 hours — spaced-repetition research shows same-day review doubles retention vs. reviewing days later`);
  }
  if (weakSubs.length > 1) {
    const w2 = weakSubs[1];
    recommendations.push(zh
      ? `下次練習集中在 ${w2.name}——每次專注一個弱點，比同時練多個更能快速建立信心`
      : `Next session, focus exclusively on ${fmtSubLocalized(w2.name, "en")} — one weak area per session builds fluency faster than mixing topics`);
  } else {
    recommendations.push(zh
      ? `在薄弱科目上增加練習頻率——每週 3 次短時間集中練習優於一次長時間練習`
      : `Increase practice frequency on your weaker section — three 20-minute focused sessions per week outperform one long session`);
  }

  const analysis: AIAnalysis = { strengths, improvements, recommendations };

  async function handleExportPDF() {
    if (!test) return;
    setPdfLoading(true);
    const sl = shsatScore ? scoreLabel(shsatScore.total) : null;
    const dateLocale = lang === "zh-TW" ? "zh-TW" : "en-US";
    exportResultsPDF({
      testName: test.test_name,
      date: new Date(test.created_at).toLocaleDateString(dateLocale, { month: "long", day: "numeric", year: "numeric" }),
      duration: test.duration,
      lang,
      totalCorrect,
      totalQuestions: test.total_questions,
      englishCorrect: engCorrect,
      englishTotal: englishQs.length,
      mathCorrect,
      mathTotal: mathQs.length,
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
        isEnglish: (q.subject ?? "").toLowerCase() === "english",
      })),
    }).finally(() => setPdfLoading(false));
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-100 shadow-sm px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 sticky top-0 z-10">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="Back"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate">{test.test_name}</h1>
          <p className="text-xs text-slate-400 hidden sm:block">
            {new Date(test.created_at).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        {/* Language toggle — admin only */}
        {user?.role === "admin" && (
          <div className="flex items-center gap-1 shrink-0">
            {(["en", "zh-TW"] as const).map(l => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={`text-xs font-semibold px-2 py-0.5 rounded-md transition-colors border ${
                  lang === l
                    ? "bg-amber-500 text-white border-amber-500"
                    : "text-slate-400 border-slate-200 hover:border-slate-400 hover:text-slate-600"
                }`}
              >
                {l === "en" ? "EN" : "繁體"}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={handleExportPDF}
          disabled={pdfLoading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 transition-colors disabled:opacity-50 shrink-0"
        >
          {pdfLoading ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )}
          <span className="hidden sm:inline">{pdfLoading ? t("Generating…", "生成中…") : t("Save as PDF", "儲存為 PDF")}</span>
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-3 sm:px-5 py-5 sm:py-8 flex flex-col gap-5">
        {/* Raw score hero */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-8 flex flex-col items-center gap-5 sm:gap-7">
          <ScoreCircle correct={totalCorrect} total={test.total_questions} lang={lang} />
          <div className="w-full flex flex-col gap-4">
            <SectionBar label={t("Revising/Editing", "修訂與編輯")}      correct={revisingCorrect} total={revisingQs.length} colorClass="bg-blue-500" />
            <SectionBar label={t("Reading Comprehension", "閱讀理解")} correct={readingCorrect}  total={readingQs.length}  colorClass="bg-sky-500"  />
            <SectionBar label={t("Math", "數學")}                  correct={mathCorrect}     total={mathCount}         colorClass="bg-violet-500" />
          </div>
        </div>

        {/* SHSAT Score Estimate — not shown for practice sessions */}
        {shsatScore && test.test_name !== "Practice" && <SHSATScoreCard score={shsatScore} lang={lang} />}

        {/* AI Coach */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="font-bold text-slate-900">{t("Performance Summary", "學習表現摘要")}</h2>
          </div>
          <div className="flex flex-col gap-3">
            <AnalysisCard title={t("Strengths", "優勢")}             items={analysis.strengths}       borderColor="border-emerald-400" bgColor="bg-emerald-50" textColor="text-emerald-800" bulletColor="text-emerald-500" />
            <AnalysisCard title={t("Areas to Improve", "待提升方向")}      items={analysis.improvements}    borderColor="border-amber-400"   bgColor="bg-amber-50"   textColor="text-amber-800"   bulletColor="text-amber-500"   />
            <AnalysisCard title={t("Study Recommendations", "學習建議")} items={analysis.recommendations} borderColor="border-blue-400"    bgColor="bg-blue-50"    textColor="text-blue-800"    bulletColor="text-blue-500"    />
          </div>
        </div>

        {/* Question review */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-sm sm:text-base">{t("Question Review", "題目回顧")}</h2>
            <div className="flex gap-2 sm:gap-3 text-xs font-medium text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />{totalCorrect} {t("correct", "題答對")}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />{questions.filter(q => q.is_correct === false).length} {t("incorrect", "題錯誤")}</span>
            </div>
          </div>
          <div className="divide-y divide-slate-50 max-h-112 overflow-y-auto">
            {Array.from({ length: test.total_questions }, (_, i) => {
              const q = questions.find(qr => qr.order_index === i + 1);
              const subjectKnown = !!q?.subject;
              const isEnglish = subjectKnown ? (q!.subject ?? "").toLowerCase() === "english" : i + 1 <= englishCount;
              const correct = q?.is_correct;
              const clickable = !!q;
              const rowCls = `w-full text-left flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 border-l-[3px] ${
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
                      {correct === true ? t("Correct", "正確") : correct === false ? t("Incorrect", "錯誤") : t("Skipped", "未作答")}
                    </span>
                  </div>
                  {subjectKnown && (
                    isEnglish ? (
                      isRevisingEditing(q?.sub_category)
                        ? <span className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0 bg-blue-50 text-blue-600">{t("Rev/Edit", "修訂/編輯")}</span>
                        : <span className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0 bg-sky-50 text-sky-600">{t("Reading", "閱讀")}</span>
                    ) : (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0 bg-violet-50 text-violet-600">{t("Math", "數學")}</span>
                    )
                  )}
                  {q?.sub_category && (
                    <span className="hidden sm:inline text-xs font-medium px-2 py-0.5 rounded-full shrink-0 bg-slate-100 text-slate-500 max-w-28 truncate">
                      {fmtSubLocalized(q.sub_category, lang)}
                    </span>
                  )}
                  {q?.difficulty && (() => {
                    const d = q.difficulty.toLowerCase();
                    const cls =
                      d === "easy"   ? "bg-emerald-50 text-emerald-600" :
                      d === "hard"   ? "bg-rose-50 text-rose-600" :
                                       "bg-amber-50 text-amber-600";
                    const label =
                      d === "easy"   ? t("Easy", "簡單") :
                      d === "hard"   ? t("Hard", "困難") :
                                       t("Med", "中等");
                    return (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${cls}`}>
                        {label}
                      </span>
                    );
                  })()}
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
