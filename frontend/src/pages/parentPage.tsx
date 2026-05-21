import { useEffect, useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase-client";
import { UserContext } from "../components/userContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCrown } from "@fortawesome/free-solid-svg-icons";
import { computeSHSATScore, scoreLabel, type Difficulty, type ScoredQuestion, type SHSATScore } from "../utils/scoring";
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
  const [ai, setAi]           = useState<AIAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiError, setAiError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [selectedQ, setSelectedQ] = useState<SelectedQuestion | null>(null);

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

      // Trigger AI analysis
      try {
        const { data: aiData, error: aiErr } = await supabase.functions.invoke("analyze-performance", {
          body: { test_id: testID, user_id: studentID },
        });
        if (aiErr || !aiData) throw new Error();
        setAi(aiData as AIAnalysis);
      } catch {
        setAiError(true);
      } finally {
        setAiLoading(false);
      }
    })();
  }, [testID, studentID]);

  const test = data?.test;
  const questions = data?.questions ?? [];
  const englishCount = test?.configuration?.english?.count ?? Math.floor((test?.total_questions ?? 0) / 2);
  const totalCorrect = questions.filter(q => q.is_correct === true).length;
  const engCorrect   = questions.filter(q => q.order_index <= englishCount && q.is_correct === true).length;
  const mathCorrect  = questions.filter(q => q.order_index > englishCount  && q.is_correct === true).length;
  const totalQ       = test?.total_questions ?? 0;
  const pct          = totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : 0;
  const pctColor     = pct >= 70 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444";

  const fallback: AIAnalysis = {
    strengths: [
      engCorrect >= englishCount * 0.7 ? "Strong ELA performance overall" : "Consistent effort across sections",
      mathCorrect >= (totalQ - englishCount) * 0.7 ? "Solid math fundamentals" : "Good attempt on challenging content",
      `Completed ${questions.length} of ${totalQ} questions`,
    ],
    improvements: [
      engCorrect < englishCount * 0.7 ? "Focus on reading comprehension and grammar" : "Push for higher ELA accuracy",
      mathCorrect < (totalQ - englishCount) * 0.7 ? "Review core math concepts" : "Target harder math problems",
      "Revisit incorrectly answered questions",
    ],
    recommendations: [
      "Practice with timed sessions to build test endurance",
      "Review explanations for all incorrect answers",
      "Spend extra study time on the lower-scoring section",
    ],
  };
  const analysis = ai ?? (aiError ? fallback : null);
  const shsatLabel = shsat ? scoreLabel(shsat.total) : null;

  function handleExportPDF() {
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
    });
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-6 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <p className="text-xs text-slate-400 font-medium">{studentName}</p>
            <h2 className="text-base font-bold text-slate-900">{test?.test_name ?? "Results"}</h2>
            {test && <p className="text-xs text-slate-400">{formatDate(test.created_at)}</p>}
          </div>
          <div className="flex items-center gap-2">
            {!loading && data && (
              <button
                type="button"
                onClick={handleExportPDF}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Save as PDF
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
          <div className="py-16 text-center text-slate-400 text-sm">Unable to load results.</div>
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
                    <span className="text-xs text-slate-400">raw score</span>
                  </div>
                </div>
                <p className="text-sm text-slate-500">{totalCorrect} / {totalQ} correct</p>
              </div>
              {/* Section bars */}
              <div className="w-full flex flex-col gap-2.5">
                {[
                  { label: "English / ELA", correct: engCorrect, total: englishCount, color: "bg-blue-500" },
                  { label: "Math", correct: mathCorrect, total: totalQ - englishCount, color: "bg-violet-500" },
                ].map(s => {
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
            </div>

            {/* SHSAT Estimate */}
            {shsat && shsatLabel && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 text-sm">Estimated SHSAT Score</h3>
                  <span className="text-xs text-slate-400 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-full">Difficulty-weighted</span>
                </div>
                <div className="flex items-end justify-center gap-1.5">
                  <span className={`text-5xl font-black tabular-nums ${shsatLabel.color === "green" ? "text-emerald-600" : shsatLabel.color === "amber" ? "text-amber-500" : "text-rose-500"}`}>
                    {shsat.total}
                  </span>
                  <span className="text-xl font-bold text-slate-300 mb-1">/700</span>
                </div>
                <div className="flex justify-center gap-6">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs text-slate-400">ELA</span>
                    <span className="text-lg font-bold text-blue-600">{Math.round(shsat.elaRatio * 100)}%</span>
                  </div>
                  <div className="w-px h-8 bg-slate-200" />
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs text-slate-400">Math</span>
                    <span className="text-lg font-bold text-violet-600">{Math.round(shsat.mathRatio * 100)}%</span>
                  </div>
                </div>
                <div className={`text-center text-xs font-medium rounded-xl py-2 px-3 border ${
                  shsatLabel.color === "green" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                  shsatLabel.color === "amber" ? "bg-amber-50 text-amber-700 border-amber-100" :
                  "bg-rose-50 text-rose-700 border-rose-100"
                }`}>{shsatLabel.text}</div>

                {/* Subcategory toggle */}
                {shsat.subcategories.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setExpanded(v => !v)}
                      className="flex items-center justify-between w-full text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors border-t border-slate-100 pt-2"
                    >
                      <span>By subcategory</span>
                      <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {expanded && (
                      <div className="flex flex-col gap-4">
                        {[
                          { label: "English / ELA", list: shsat.subcategories.filter(s => s.subject === "english"), accent: "bg-blue-500" },
                          { label: "Math",           list: shsat.subcategories.filter(s => s.subject === "math"),    accent: "bg-violet-500" },
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
                                      <span className="text-slate-600">{sub.name}</span>
                                      <span className={`font-bold tabular-nums ${color}`}>
                                        {sc}<span className="text-slate-300 font-normal"> /700</span>
                                        <span className="text-slate-400 font-normal ml-1">({sub.correct}/{sub.total})</span>
                                      </span>
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

            {/* AI Coach */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="font-bold text-slate-900">AI Coach</h3>
                <span className={`ml-auto text-xs rounded-full px-2.5 py-0.5 font-medium border ${
                  aiLoading ? "text-slate-400 border-slate-200" :
                  !aiError  ? "text-blue-600 border-blue-200 bg-blue-50" :
                  "text-amber-600 border-amber-200 bg-amber-50"
                }`}>
                  {aiLoading ? "Analyzing…" : !aiError ? "Powered by Claude" : "Auto summary"}
                </span>
              </div>
              {aiLoading ? (
                <div className="flex flex-col gap-3 animate-pulse">
                  <div className="h-4 bg-slate-100 rounded-full w-4/5" />
                  <div className="h-4 bg-slate-100 rounded-full w-3/5" />
                  <div className="h-4 bg-slate-100 rounded-full w-2/3" />
                </div>
              ) : analysis && (
                <div className="flex flex-col gap-3">
                  {([
                    { key: "strengths" as const,       title: "Strengths",              border: "border-emerald-400", bg: "bg-emerald-50", text: "text-emerald-800", bullet: "text-emerald-500" },
                    { key: "improvements" as const,    title: "Areas to Improve",       border: "border-amber-400",   bg: "bg-amber-50",   text: "text-amber-800",   bullet: "text-amber-500"   },
                    { key: "recommendations" as const, title: "Study Recommendations",  border: "border-blue-400",    bg: "bg-blue-50",    text: "text-blue-800",    bullet: "text-blue-500"    },
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
              )}
            </div>

            {/* Question review */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-900">Question Review</h3>
                <div className="flex gap-3 text-xs font-medium text-slate-400">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />{totalCorrect} correct</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />{questions.filter(q => q.is_correct === false).length} incorrect</span>
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
                          {correct === true ? "Correct" : correct === false ? "Incorrect" : "Skipped"}
                        </span>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${isEng ? "bg-blue-50 text-blue-600" : "bg-violet-50 text-violet-600"}`}>
                        {isEng ? "ELA" : "Math"}
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

  // AI analysis state per test
  const [aiState, setAiState] = useState<Record<string, "loading" | "done" | "error">>({});

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

  // ── AI Analysis ──────────────────────────────────────────────────────────

  async function runAI(test: TestRecord) {
    if (!selectedStudent || aiState[test.id] === "loading") return;
    setAiState(prev => ({ ...prev, [test.id]: "loading" }));
    const { data, error } = await supabase.functions.invoke("analyze-performance", {
      body: { test_id: test.id, user_id: selectedStudent.id },
    });
    setAiState(prev => ({ ...prev, [test.id]: (error || !data || data.error) ? "error" : "done" }));
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
          <span className="font-bold text-slate-800 text-sm">Chan Tutoring</span>
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
                      const ai = aiState[test.id];
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
                            <div className="flex items-center gap-2 shrink-0">
                              {/* View Results */}
                              <button
                                type="button"
                                onClick={() => setViewResult({
                                  testID: test.id,
                                  studentID: selectedStudent.id,
                                  studentName: `${selectedStudent.first_name} ${selectedStudent.last_name}`,
                                  duration: test.duration,
                                })}
                                className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                              >
                                View Results
                              </button>

                              {/* AI Analysis */}
                              <button
                                type="button"
                                disabled={ai === "loading"}
                                onClick={() => runAI(test)}
                                title={ai === "done" ? "Analysis saved — open results to view" : ai === "error" ? "Analysis failed — click to retry" : "Request AI coaching analysis"}
                                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
                                  ai === "done"    ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                  ai === "error"   ? "bg-rose-50 text-rose-600 border-rose-200" :
                                  ai === "loading" ? "bg-slate-50 text-slate-400 border-slate-200" :
                                  "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600"
                                }`}
                              >
                                {ai === "loading" ? (
                                  <span className="flex items-center gap-1.5">
                                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    Analyzing…
                                  </span>
                                ) : ai === "done" ? "✓ Analysis ready" :
                                   ai === "error"  ? "Retry analysis" :
                                   "AI Analysis"}
                              </button>
                            </div>
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
