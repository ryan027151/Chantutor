import { useEffect, useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase-client";
import { UserContext } from "../components/userContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCrown } from "@fortawesome/free-solid-svg-icons";
import { computeSHSATScore, scoreLabel, isRevisingEditing, type Difficulty, type ScoredQuestion, type SHSATScore } from "../utils/scoring";
import QuestionDetailModal from "../components/QuestionDetailModal";
import { exportResultsPDF } from "../utils/exportResultsPDF";

// ── Types ────────────────────────────────────────────────────────────────────

interface Student { id: string; first_name: string; last_name: string; }

interface TestRecord {
  id: string;
  test_name: string;
  created_at: string;
  score: number | null;
  total_questions: number;
  duration: number;
  configuration: Record<string, { count: number }> | null;
}

interface QuestionResult {
  id: string;
  order_index: number;
  is_correct: boolean | null;
  student_answer: string | null;
  difficulty: string;
  sub_category: string | null;
  subject: string | null;
}

interface SelectedQuestion {
  uid: string;
  studentAnswer: string | null;
  isCorrect: boolean | null;
  questionNumber: number;
}

interface TestResults {
  test: { test_name: string; created_at: string; total_questions: number; configuration: Record<string, { count: number }> | null };
  questions: QuestionResult[];
}

interface AIAnalysis { strengths: string[]; improvements: string[]; recommendations: string[]; }

// ── Helpers ───────────────────────────────────────────────────────────────────

const invoke = (action: string, extra?: object) =>
  supabase.functions.invoke("parent-api", { body: { action, ...extra } });

function initials(s: Student) {
  return `${s.first_name[0]}${s.last_name[0]}`.toUpperCase();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDuration(min: number) {
  if (min === 0) return "Untimed";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""}` : `${m}m`;
}

// ── Small shared components ───────────────────────────────────────────────────

function Avatar({ student, size = "md" }: { student: Student; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "w-8 h-8 text-xs" : size === "lg" ? "w-12 h-12 text-base" : "w-10 h-10 text-sm";
  return (
    <div className={`${sz} rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center font-bold text-blue-700 shrink-0`}>
      {initials(student)}
    </div>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return (
    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">In Progress</span>
  );
  const color = score >= 70 ? "bg-emerald-50 text-emerald-700" : score >= 50 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700";
  return <span className={`text-xs font-bold px-2.5 py-1 rounded-full tabular-nums ${color}`}>{score}%</span>;
}

// ── Language translations ─────────────────────────────────────────────────────

type Lang = "en" | "zh-TW";

interface LangStrings {
  saveAsPDF: string; pdfGenerating: string;
  rawScore: string; correct: (n: number, m: number) => string;
  ela: string; math: string;
  revisingEditing: string; readingComprehension: string;
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

const SCORE_BAND_TW: Record<string, string> = {
  "Top-school competitive range":                   "頂尖學校競爭水準",
  "Competitive range for specialized schools":      "特色學校競爭水準",
  "Approaching competitive — keep going!":          "接近競爭水準，繼續加油！",
  "Keep practicing — you're building real skills!": "持續練習，你正在穩步提升！",
};

// Keys cover both underscore DB format and space/symbol display format.
const SUBCAT_TW: Record<string, string> = {
  // ── English / ELA ──────────────────────────────────────────────────────────
  Authors_Perspective:               "作者的觀點立場",
  "Author's Perspective":            "作者的觀點立場",
  Authors_Point_of_View:             "作者的敘述視角",
  "Author's Point of View":          "作者的敘述視角",
  Authors_Purpose:                   "作者的寫作目的",
  "Author's Purpose":                "作者的寫作目的",
  "Author's Purpose & Tone":         "作者目的與語氣",
  Authors_Purpose_and_Tone:          "作者目的與語氣",
  Central_Idea:                      "中心思想",
  "Central Idea":                    "中心思想",
  Comma_Usage:                       "逗號用法",
  "Comma Usage":                     "逗號用法",
  Figurative_Language:               "修辭手法",
  "Figurative Language":             "修辭手法",
  Inference:                         "推理",
  Inference_and_Implied_Ideas:       "推理與隱含含義",
  "Inference and Implied Ideas":     "推理與隱含含義",
  Main_Idea:                         "段落主旨",
  "Main Idea":                       "段落主旨",
  "Organization-Concluding_Sentence":"段落組織：結尾句",
  "Organization-Logical_Placement":  "段落組織：邏輯排列",
  "Organization-Paragraph_Unity":    "段落組織：段落統一",
  "Organization-Topic_Sentence":     "段落組織：主題句",
  "Organization-Transitions":        "段落組織：過渡語",
  Plot_Development:                  "情節發展",
  "Plot Development":                "情節發展",
  Poetic_Technique:                  "詩歌技巧",
  "Poetic Technique":                "詩歌技巧",
  Point_of_View:                     "敘述視角",
  "Point of View":                   "敘述視角",
  Pronoun_Agreement:                 "代詞一致性",
  "Pronoun Agreement":               "代詞一致性",
  Punctuation:                       "標點符號",
  Sentence_Combining:                "句子合併",
  "Sentence Combining":              "句子合併",
  Sentence_Structure:                "句子結構",
  "Sentence Structure":              "句子結構",
  Setting:                           "場景與背景",
  "Style-Word_Choice":               "寫作風格：用詞選擇",
  "Subject-Verb_Agreement":          "主謂一致性",
  "Subject Verb Agreement":          "主謂一致性",
  Summarization:                     "文章概括",
  Supporting_Details:                "支持性細節",
  "Supporting Details":              "支持性細節",
  Text_Feature:                      "文本特徵",
  "Text Feature":                    "文本特徵",
  Text_Organization:                 "文章組織",
  "Text Organization":               "文章組織",
  Text_Structure:                    "文章結構",
  "Text Structure":                  "文章結構",
  Textual_Evidence:                  "文本依據",
  "Textual Evidence":                "文本依據",
  Textual_Evidence_and_Reasoning:    "文本依據與推理",
  "Textual Evidence and Reasoning":  "文本依據與推理",
  Theme:                             "文章主題",
  Tone:                              "文章語氣",
  "Usage_&_Grammar":                 "語言用法與語法",
  "Usage & Grammar":                 "語言用法與語法",
  Verb_Tense:                        "動詞時態",
  "Verb Tense":                      "動詞時態",
  Vocabulary_in_Context:             "語境詞彙",
  "Vocabulary in Context":           "語境詞彙",
  Word_Choice:                       "詞語選擇",
  "Word Choice":                     "詞語選擇",
  // ── Math ───────────────────────────────────────────────────────────────────
  Algebra_and_Equations:             "代數與方程式",
  "Algebra and Equations":           "代數與方程式",
  "Algebra & Equations":             "代數與方程式",
  Algebraic_Expressions:             "代數式",
  "Algebraic Expressions":           "代數式",
  Arithmetic:                        "基礎算術",
  Fraction_Word_Problems:            "分數應用題",
  "Fraction Word Problems":          "分數應用題",
  Geometry:                          "幾何",
  Inequalities:                      "不等式",
  "Linear_Eq._Formula":              "線性方程式",
  "Linear Eq. Formula":              "線性方程式",
  Percentage:                        "百分比",
  Probability:                       "機率",
  "Rate-Unit_Rate":                  "速率／單位速率",
  "Rate / Unit Rate":                "速率／單位速率",
  "Rate/Unit Rate":                  "速率／單位速率",
  Ratios_and_Proportions:            "比例關係",
  "Ratios and Proportions":          "比例關係",
  "Ratios & Proportions":            "比例關係",
  Sequence:                          "數列規律",
  Stats_and_Data_Analysis:           "統計與資料分析",
  "Stats and Data Analysis":         "統計與資料分析",
  "Stats & Data Analysis":           "統計與資料分析",
  Statistics:                        "統計",
  // ── Fallback ───────────────────────────────────────────────────────────────
  General:                           "綜合",
  Uncategorized:                     "未分類",
};

function fmtSubEN(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/^Organization-/, "Org: ")
    .replace(/^Style-/, "Style: ")
    .replace(/\bEq\b\.?/g, "Eq.")
    .replace(/\band\b/g, "&");
}

const T: Record<Lang, LangStrings> = {
  en: {
    saveAsPDF: "Save as PDF", pdfGenerating: "Generating…",
    rawScore: "raw score", correct: (n, m) => `${n} / ${m} correct`,
    ela: "English / ELA", math: "Math",
    revisingEditing: "Revising/Editing", readingComprehension: "Reading Comprehension",
    estimatedScore: "Estimated SHSAT Score", diffWeighted: "Difficulty-weighted", bySubcategory: "By subcategory",
    performanceSummary: "Performance Summary",
    strengths: "Strengths", improvements: "Areas to Improve", recommendations: "Study Recommendations",
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
      "Practice with timed sessions to build test endurance",
      "Review explanations for all incorrect answers",
      "Spend extra study time on the lower-scoring section",
    ],
  },
  "zh-TW": {
    saveAsPDF: "儲存為 PDF", pdfGenerating: "生成中…",
    rawScore: "原始分數", correct: (n, m) => `${n} / ${m} 題答對`,
    ela: "英語 / 語文", math: "數學",
    revisingEditing: "修訂與編輯", readingComprehension: "閱讀理解",
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

// ── Results Modal ─────────────────────────────────────────────────────────────

function ResultsModal({
  testID, studentID, studentName, duration,
  onClose,
}: {
  testID: string; studentID: string; studentName: string; duration: number;
  onClose: () => void;
}) {
  const [data, setData]       = useState<TestResults | null>(null);
  const [shsat, setShsat]     = useState<SHSATScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedQ, setSelectedQ] = useState<SelectedQuestion | null>(null);
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: res, error } = await invoke("get_test_results", { student_id: studentID, test_id: testID });
      if (error || !res) { setLoading(false); return; }
      setData(res as TestResults);

      const { test, questions } = res as TestResults;
      const englishCnt = test.configuration?.english?.count ?? Math.floor(test.total_questions / 2);
      const scored: ScoredQuestion[] = questions.map((q: QuestionResult) => ({
        order_index:  q.order_index,
        is_correct:   q.is_correct,
        difficulty:   (q.difficulty as Difficulty) ?? "medium",
        sub_category: q.sub_category ?? undefined,
        subject:      q.subject ?? undefined,
      }));
      setShsat(computeSHSATScore(scored, englishCnt));
      setLoading(false);

    })();
  }, [testID, studentID]);

  const t = T[lang];

  const test = data?.test;
  const questions = data?.questions ?? [];
  const englishCount = test?.configuration?.english?.count ?? Math.floor((test?.total_questions ?? 0) / 2);
  const totalCorrect = questions.filter(q => q.is_correct === true).length;
  const engCorrect   = questions.filter(q => q.order_index <= englishCount && q.is_correct === true).length;
  const mathCorrect  = questions.filter(q => q.order_index > englishCount  && q.is_correct === true).length;
  const totalQ       = test?.total_questions ?? 0;
  const pct          = totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : 0;
  const pctColor     = pct >= 70 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444";

  const engGood  = engCorrect >= englishCount * 0.7;
  const mathGood = mathCorrect >= (totalQ - englishCount) * 0.7;
  const analysis: AIAnalysis = {
    strengths:       t.fallbackStrengths(engGood, mathGood, questions.length, totalQ),
    improvements:    t.fallbackImprovements(engGood, mathGood),
    recommendations: t.fallbackRecs(),
  };
  const shsatLabel = shsat ? scoreLabel(shsat.total) : null;

  function handleExportPDF() {
    setPdfLoading(true);
    exportResultsPDF({
      testName: test?.test_name ?? "Results",
      date: test ? formatDate(test.created_at) : "",
      duration,
      totalCorrect,
      totalQuestions: totalQ,
      englishCorrect: engCorrect,
      englishTotal: englishCount,
      mathCorrect,
      mathTotal: totalQ - englishCount,
      studentName,
      shsatScore: shsat && shsatLabel ? {
        total: shsat.total,
        elaRatio: shsat.elaRatio,
        mathRatio: shsat.mathRatio,
        revisingRatio: shsat.revisingRatio,
        readingRatio: shsat.readingRatio,
        labelText: shsatLabel.text,
        labelColor: shsatLabel.color,
        subcategories: shsat.subcategories,
      } : undefined,
      aiAnalysis: analysis ?? undefined,
      questions: questions.map(q => ({
        orderIndex: q.order_index,
        isCorrect: q.is_correct,
        isEnglish: q.order_index <= englishCount,
      })),
    }).finally(() => setPdfLoading(false));
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-6 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-1 mb-2">
              {(["en", "zh-TW"] as const).map(l => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  className={`text-xs font-semibold px-2 py-0.5 rounded-md transition-colors border ${
                    lang === l
                      ? "bg-blue-600 text-white border-blue-600"
                      : "text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600"
                  }`}
                >
                  {l === "en" ? "EN" : "繁體"}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 font-medium">{studentName}</p>
            <h2 className="text-base font-bold text-slate-900">{test?.test_name ?? "Results"}</h2>
            {test && <p className="text-xs text-slate-400">{formatDate(test.created_at)}</p>}
          </div>
          <div className="flex items-center gap-2">
            {!loading && data && (
              <button
                type="button"
                onClick={handleExportPDF}
                disabled={pdfLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 transition-colors disabled:opacity-50"
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
              aria-label="Close"
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !data ? (
          <div className="py-16 text-center text-slate-400 text-sm">{t.unableToLoad}</div>
        ) : (
          <div className="p-6 flex flex-col gap-5 overflow-y-auto">

            {/* Score hero */}
            <div className="bg-slate-50 rounded-2xl border border-slate-100 p-6 flex flex-col items-center gap-5">
              <div className="flex flex-col items-center gap-2">
                <div
                  className="relative w-32 h-32 rounded-full"
                  style={{ background: `conic-gradient(${pctColor} ${pct}%, #e2e8f0 ${pct}%)` }}
                >
                  <div className="absolute inset-3 bg-slate-50 rounded-full flex flex-col items-center justify-center gap-0.5">
                    <span className="text-3xl font-black text-slate-900">{pct}%</span>
                    <span className="text-xs text-slate-400">{t.rawScore}</span>
                  </div>
                </div>
                <p className="text-sm text-slate-500">{t.correct(totalCorrect, totalQ)}</p>
              </div>
              {/* Section bars */}
              {(() => {
                const engQs   = questions.filter(q => q.order_index <= englishCount);
                const revQs   = engQs.filter(q => isRevisingEditing(q.sub_category));
                const rcQs    = engQs.filter(q => !isRevisingEditing(q.sub_category));
                const revCorr = revQs.filter(q => q.is_correct === true).length;
                const rcCorr  = rcQs.filter(q => q.is_correct === true).length;
                const bars = [
                  { label: t.revisingEditing,      correct: revCorr,    total: revQs.length,          color: "bg-blue-500"   },
                  { label: t.readingComprehension,  correct: rcCorr,     total: rcQs.length,           color: "bg-sky-500"    },
                  { label: t.math,                  correct: mathCorrect, total: totalQ - englishCount, color: "bg-violet-500" },
                ];
                return (
                  <div className="w-full flex flex-col gap-2.5">
                    {bars.map(s => {
                      const p = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
                      return (
                        <div key={s.label} className="flex flex-col gap-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium text-slate-600">{s.label}</span>
                            <span className="text-slate-400">{s.correct}/{s.total} · {p}%</span>
                          </div>
                          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${s.color}`} style={{ width: `${p}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* SHSAT Estimate */}
            {shsat && shsatLabel && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 text-sm">{t.estimatedScore}</h3>
                  <span className="text-xs text-slate-400 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-full">{t.diffWeighted}</span>
                </div>
                <div className="flex items-end justify-center gap-1.5">
                  <span className={`text-5xl font-black tabular-nums ${shsatLabel.color === "green" ? "text-emerald-600" : shsatLabel.color === "amber" ? "text-amber-500" : "text-rose-500"}`}>
                    {shsat.total}
                  </span>
                  <span className="text-xl font-bold text-slate-300 mb-1">/700</span>
                </div>
                <div className="flex justify-center gap-3">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs text-slate-400">{t.revisingEditing}</span>
                    <span className="text-base font-bold text-blue-600">{Math.round(shsat.revisingRatio * 100)}%</span>
                  </div>
                  <div className="w-px h-8 bg-slate-200" />
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs text-slate-400">{t.readingComprehension}</span>
                    <span className="text-base font-bold text-sky-600">{Math.round(shsat.readingRatio * 100)}%</span>
                  </div>
                  <div className="w-px h-8 bg-slate-200" />
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs text-slate-400">{t.math}</span>
                    <span className="text-base font-bold text-violet-600">{Math.round(shsat.mathRatio * 100)}%</span>
                  </div>
                </div>
                <div className={`text-center text-xs font-medium rounded-xl py-2 px-3 border ${
                  shsatLabel.color === "green" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                  shsatLabel.color === "amber" ? "bg-amber-50 text-amber-700 border-amber-100" :
                  "bg-rose-50 text-rose-700 border-rose-100"
                }`}>{t.translateScore(shsatLabel.text)}</div>

                {/* Subcategory toggle */}
                {shsat.subcategories.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setExpanded(v => !v)}
                      className="flex items-center justify-between w-full text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors border-t border-slate-100 pt-2"
                    >
                      <span>{t.bySubcategory}</span>
                      <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {expanded && (
                      <div className="flex flex-col gap-4">
                        {[
                          { label: t.revisingEditing,     list: shsat.subcategories.filter(s => s.subject === "english" && isRevisingEditing(s.name)),  accent: "bg-blue-500"   },
                          { label: t.readingComprehension, list: shsat.subcategories.filter(s => s.subject === "english" && !isRevisingEditing(s.name)), accent: "bg-sky-500"    },
                          { label: t.math,                list: shsat.subcategories.filter(s => s.subject === "math"),                                   accent: "bg-violet-500" },
                        ].filter(g => g.list.length > 0).map(group => (
                          <div key={group.label}>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{group.label}</p>
                            <div className="flex flex-col gap-2">
                              {group.list.map(sub => {
                                const sc = sub.score;
                                const color = sc >= 580 ? "text-emerald-600" : sc >= 450 ? "text-amber-500" : "text-rose-500";
                                return (
                                  <div key={sub.name} className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-slate-600">{t.translateSubcategory(sub.name)}</span>
                                      <span className="text-slate-400 font-normal">({sub.correct}/{sub.total})</span>
                                    </div>
                                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full ${group.accent}`} style={{ width: `${Math.round(((sc - 200) / 500) * 100)}%` }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Performance Summary */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="font-bold text-slate-900">{t.performanceSummary}</h3>
              </div>
              <div className="flex flex-col gap-3">
                {([
                  { key: "strengths"       as const, title: t.strengths,       border: "border-emerald-400", bg: "bg-emerald-50", text: "text-emerald-800", bullet: "text-emerald-500" },
                  { key: "improvements"    as const, title: t.improvements,    border: "border-amber-400",   bg: "bg-amber-50",   text: "text-amber-800",   bullet: "text-amber-500"   },
                  { key: "recommendations" as const, title: t.recommendations, border: "border-blue-400",    bg: "bg-blue-50",    text: "text-blue-800",    bullet: "text-blue-500"    },
                ]).map(({ key, title, border, bg, text, bullet }) => (
                  <div key={key} className={`border-l-4 rounded-r-xl p-4 ${border} ${bg}`}>
                    <p className={`text-xs font-bold uppercase tracking-wider mb-2.5 ${text}`}>{title}</p>
                    <ul className="flex flex-col gap-1.5">
                      {analysis[key].map((item, i) => (
                        <li key={i} className={`text-sm flex gap-2 ${text} opacity-90`}>
                          <span className={`${bullet} mt-0.5 shrink-0`}>›</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* Question review */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-900">{t.questionReview}</h3>
                <div className="flex gap-3 text-xs font-medium text-slate-400">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />{t.correctCount(totalCorrect)}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />{t.incorrectCount(questions.filter(q => q.is_correct === false).length)}</span>
                </div>
              </div>
              <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
                {Array.from({ length: totalQ }, (_, i) => {
                  const q = questions.find(qr => qr.order_index === i + 1);
                  const isEng = i + 1 <= englishCount;
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
                          {correct === true ? t.correctLabel : correct === false ? t.incorrectLabel : t.skippedLabel}
                        </span>
                      </div>
                      {isEng ? (
                        isRevisingEditing(q?.sub_category)
                          ? <span className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0 bg-blue-50 text-blue-600">{t.revisingEditing}</span>
                          : <span className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0 bg-sky-50 text-sky-600">{t.readingComprehension}</span>
                      ) : (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0 bg-violet-50 text-violet-600">{t.math}</span>
                      )}
                      {q?.sub_category && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0 bg-slate-100 text-slate-500">
                          {t.translateSubcategory(q.sub_category)}
                        </span>
                      )}
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

// ── Main Page ─────────────────────────────────────────────────────────────────

function ParentPage() {
  const user     = useContext(UserContext);
  const navigate = useNavigate();

  const [students,       setStudents]       = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [tests,          setTests]          = useState<TestRecord[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingTests,   setLoadingTests]   = useState(false);

  // Results modal
  const [viewResult, setViewResult] = useState<{ testID: string; studentID: string; studentName: string; duration: number } | null>(null);

  // Add child modal
  const [addModal,       setAddModal]       = useState(false);
  const [addEmail,       setAddEmail]       = useState("");
  const [addLoading,     setAddLoading]     = useState(false);
  const [addError,       setAddError]       = useState("");

  // Remove child confirm
  const [removeTarget,  setRemoveTarget]   = useState<Student | null>(null);
  const [removeLoading, setRemoveLoading]  = useState(false);
  const [removeError,   setRemoveError]    = useState("");

  // ── Data loading ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    loadStudents();
  }, [user]);

  async function loadStudents() {
    setLoadingStudents(true);
    const { data, error } = await invoke("get_students");
    if (!error && data?.students) {
      setStudents(data.students as Student[]);
      if (data.students.length > 0 && !selectedStudent) {
        selectStudent(data.students[0]);
      }
    }
    setLoadingStudents(false);
  }

  async function selectStudent(s: Student) {
    setSelectedStudent(s);
    setTests([]);
    setLoadingTests(true);
    const { data, error } = await invoke("get_tests", { student_id: s.id });
    if (!error && data?.tests) setTests(data.tests as TestRecord[]);
    setLoadingTests(false);
  }

  // ── Add child ────────────────────────────────────────────────────────────

  async function handleAddChild() {
    if (!addEmail.trim()) { setAddError("Please enter a student email address."); return; }
    setAddLoading(true);
    setAddError("");
    const { data, error } = await invoke("link_student", { student_email: addEmail.trim() });
    setAddLoading(false);
    if (error || data?.error) {
      setAddError(data?.error ?? "Failed to add student. Please try again.");
      return;
    }
    const newStudent = data.student as Student;
    setStudents(prev => [...prev, newStudent]);
    setAddModal(false);
    setAddEmail("");
    selectStudent(newStudent);
  }

  // ── Remove child ─────────────────────────────────────────────────────────

  async function handleRemoveChild() {
    if (!removeTarget) return;
    setRemoveLoading(true);
    setRemoveError("");
    const { data, error } = await invoke("unlink_student", { student_id: removeTarget.id });
    setRemoveLoading(false);
    if (error || data?.error) {
      setRemoveError(data?.error ?? "Failed to remove student.");
      return;
    }
    const remaining = students.filter(s => s.id !== removeTarget.id);
    setStudents(remaining);
    setRemoveTarget(null);
    if (selectedStudent?.id === removeTarget.id) {
      if (remaining.length > 0) selectStudent(remaining[0]);
      else { setSelectedStudent(null); setTests([]); }
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate("/");
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const completedTests = tests.filter(t => t.score !== null);

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-100 shadow-sm px-6 py-3.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <FontAwesomeIcon icon={faCrown} className="text-lg text-amber-400" />
          <span className="brand-name text-base text-slate-800">TestQueens</span>
          <span className="text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-full">
            Parent Portal
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500 hidden sm:block">
            {user?.first_name} {user?.last_name}
          </span>
          <button
            type="button"
            onClick={signOut}
            className="text-sm font-medium text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar: children list ── */}
        <div className="w-72 shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-700">My Children</h2>
            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">{students.length}</span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5">
            {loadingStudents ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : students.length === 0 ? (
              <div className="text-center py-10 px-4">
                <p className="text-sm text-slate-400">No children linked yet.</p>
                <p className="text-xs text-slate-300 mt-1">Add a child using the button below.</p>
              </div>
            ) : students.map(s => (
              <div key={s.id} className="relative group">
                <button
                  type="button"
                  onClick={() => selectStudent(s)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all border ${
                    selectedStudent?.id === s.id
                      ? "bg-blue-50 border-blue-200 shadow-sm"
                      : "border-transparent hover:bg-slate-50 hover:border-slate-200"
                  }`}
                >
                  <Avatar student={s} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold truncate ${selectedStudent?.id === s.id ? "text-blue-700" : "text-slate-800"}`}>
                      {s.first_name} {s.last_name}
                    </p>
                    <p className="text-xs text-slate-400">Student</p>
                  </div>
                </button>
                {/* Remove button — only visible on hover and only if >1 student */}
                {students.length > 1 && (
                  <button
                    type="button"
                    title="Remove child"
                    onClick={() => { setRemoveError(""); setRemoveTarget(s); }}
                    className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add child button */}
          <div className="p-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => { setAddEmail(""); setAddError(""); setAddModal(true); }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Child
            </button>
          </div>
        </div>

        {/* ── Main content ── */}
        <div className="flex-1 overflow-y-auto">
          {!selectedStudent ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <p className="text-sm text-slate-400">
                  {loadingStudents ? "Loading…" : "Select a child from the sidebar"}
                </p>
              </div>
            </div>
          ) : (
            <div className="p-6 flex flex-col gap-5 max-w-4xl">

              {/* Student header */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
                <Avatar student={selectedStudent} size="lg" />
                <div className="flex-1 min-w-0">
                  <h1 className="text-lg font-bold text-slate-900">{selectedStudent.first_name} {selectedStudent.last_name}</h1>
                  <p className="text-sm text-slate-400">Student</p>
                </div>
                <div className="flex gap-6 shrink-0">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-slate-900">{tests.length}</p>
                    <p className="text-xs text-slate-400">Total Tests</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-emerald-600">{completedTests.length}</p>
                    <p className="text-xs text-slate-400">Completed</p>
                  </div>
                  {completedTests.length > 0 && (
                    <div className="text-center">
                      <p className="text-2xl font-bold text-blue-600">
                        {Math.round(completedTests.reduce((s, t) => s + (t.score ?? 0), 0) / completedTests.length)}%
                      </p>
                      <p className="text-xs text-slate-400">Avg Score</p>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/performance/${selectedStudent.id}`)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  View Performance
                </button>
              </div>

              {/* Tests list */}
              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Test &amp; Practice History</h2>

                {loadingTests ? (
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : tests.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center text-sm text-slate-400">
                    No tests taken yet.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {tests.map(test => {
                      const isCompleted = test.score !== null;
                      return (
                        <div key={test.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 flex items-center gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-slate-900">{test.test_name || "Untitled"}</p>
                              {test.test_name === "Diagnostic Test" && (
                                <span className="text-xs font-medium bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full">Diagnostic</span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {formatDate(test.created_at)} · {test.total_questions} questions · {formatDuration(test.duration)}
                            </p>
                          </div>

                          <ScoreBadge score={test.score} />

                          {isCompleted && (
                            <button
                              type="button"
                              onClick={() => setViewResult({
                                testID: test.id,
                                studentID: selectedStudent.id,
                                studentName: `${selectedStudent.first_name} ${selectedStudent.last_name}`,
                                duration: test.duration,
                              })}
                              className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors shrink-0"
                            >
                              View Results
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>

      {/* ── Add Child Modal ── */}
      {addModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Add a Child</h3>
              <button
                type="button"
                onClick={() => setAddModal(false)}
                aria-label="Close"
                className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <p className="text-sm text-slate-500">
                Enter your child's registered email address. Their account must already exist in the system.
              </p>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">Student Email</span>
                <input
                  type="email"
                  value={addEmail}
                  onChange={e => { setAddEmail(e.target.value); setAddError(""); }}
                  placeholder="child@example.com"
                  autoFocus
                  onKeyDown={e => e.key === "Enter" && handleAddChild()}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </label>
              {addError && (
                <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{addError}</p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
              <button
                type="button"
                onClick={() => setAddModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddChild}
                disabled={addLoading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                {addLoading ? "Linking…" : "Add Child"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Remove Confirm Modal ── */}
      {removeTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col">
            <div className="p-6 flex flex-col gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center">
                <svg className="w-6 h-6 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6h12a6 6 0 00-6-6zM21 12h-6" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Remove {removeTarget.first_name}?</h3>
                <p className="text-sm text-slate-500 mt-1">
                  You will no longer be able to view {removeTarget.first_name}'s test results. This does not delete their account.
                </p>
              </div>
              {removeError && (
                <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{removeError}</p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
              <button
                type="button"
                onClick={() => setRemoveTarget(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRemoveChild}
                disabled={removeLoading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors disabled:opacity-60"
              >
                {removeLoading ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Results Modal ── */}
      {viewResult && (
        <ResultsModal
          testID={viewResult.testID}
          studentID={viewResult.studentID}
          studentName={viewResult.studentName}
          duration={viewResult.duration}
          onClose={() => setViewResult(null)}
        />
      )}
    </div>
  );
}

export default ParentPage;
