import { useState, useEffect } from "react";
import { supabase } from "../supabase-client";
import ResultsModal from "./ResultsModal";

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
}

interface TestRecord {
  id: string;
  test_name: string;
  created_at: string;
  score: number | null;
  duration: number;
  total_questions: number;
  configuration: Record<string, { count: number }> | null;
}

interface QuestionStat {
  is_correct: boolean | null;
  order_index: number;
}

interface AIAnalysis {
  strengths: string[];
  improvements: string[];
  recommendations: string[];
}

interface ProfileForm {
  first_name: string;
  last_name: string;
  role: string;
}

const ANALYSIS_COLORS = {
  strengths: {
    card: "bg-emerald-500/5 border-emerald-500/15",
    title: "text-emerald-400",
    bullet: "text-emerald-500",
    text: "text-emerald-100",
  },
  improvements: {
    card: "bg-amber-500/5 border-amber-500/15",
    title: "text-amber-400",
    bullet: "text-amber-500",
    text: "text-amber-100",
  },
  recommendations: {
    card: "bg-blue-500/5 border-blue-500/15",
    title: "text-blue-400",
    bullet: "text-blue-500",
    text: "text-blue-100",
  },
} as const;

function formatDuration(min: number) {
  if (min === 0) return "Untimed";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}` : `${m}m`;
}

function DarkInput({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/25 transition-colors"
      />
    </label>
  );
}

export default function AdminStudentsPanel() {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<Student | null>(null);
  const [tests, setTests] = useState<TestRecord[]>([]);
  const [loadingTests, setLoadingTests] = useState(false);

  const [expandedTest, setExpandedTest] = useState<string | null>(null);
  const [questionStats, setQuestionStats] = useState<Record<string, QuestionStat[]>>({});
  const [analysis, setAnalysis] = useState<Record<string, AIAnalysis | "loading" | "error">>({});

  // Edit profile
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileForm>({ first_name: "", last_name: "", role: "student" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Delete student
  const [confirmDeleteStudent, setConfirmDeleteStudent] = useState(false);
  const [deletingStudent, setDeletingStudent] = useState(false);

  // Per-test actions: { testId, action }
  const [testConfirm, setTestConfirm] = useState<{ id: string; action: "delete" | "reset" } | null>(null);
  const [processingTest, setProcessingTest] = useState(false);

  // Results modal
  const [resultsModal, setResultsModal] = useState<{ testID: string; userID: string } | null>(null);

  async function loadStudents() {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, role")
      .in("role", ["student", "parent"])
      .order("first_name");
    setStudents((data as Student[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { loadStudents(); }, []);

  async function selectStudent(s: Student) {
    setSelected(s);
    setTests([]);
    setExpandedTest(null);
    setQuestionStats({});
    setAnalysis({});
    setConfirmDeleteStudent(false);
    setEditingProfile(false);
    setLoadingTests(true);
    const { data } = await supabase
      .from("tests")
      .select("id, test_name, created_at, score, duration, total_questions, configuration")
      .eq("user_id", s.id)
      .order("created_at", { ascending: false });
    setTests((data as TestRecord[]) ?? []);
    setLoadingTests(false);
  }

  async function expandTest(test: TestRecord) {
    const isOpen = expandedTest === test.id;
    setExpandedTest(isOpen ? null : test.id);
    if (isOpen || questionStats[test.id]) return;
    const { data } = await supabase
      .from("questions")
      .select("is_correct, order_index")
      .eq("test_id", test.id)
      .eq("user_id", selected!.id);
    setQuestionStats(prev => ({ ...prev, [test.id]: (data as QuestionStat[]) ?? [] }));
  }

  async function runAnalysis(test: TestRecord) {
    setAnalysis(prev => ({ ...prev, [test.id]: "loading" }));
    try {
      const { data, error } = await supabase.functions.invoke("analyze-performance", {
        body: { test_id: test.id, user_id: selected!.id },
      });
      if (error || !data) throw new Error();
      setAnalysis(prev => ({ ...prev, [test.id]: data as AIAnalysis }));
    } catch {
      setAnalysis(prev => ({ ...prev, [test.id]: "error" }));
    }
  }

  // ── Edit profile ────────────────────────────────────────────────────────────

  function openEditProfile() {
    if (!selected) return;
    setProfileForm({ first_name: selected.first_name, last_name: selected.last_name, role: selected.role });
    setProfileError(null);
    setEditingProfile(true);
  }

  async function saveProfile() {
    if (!selected) return;
    if (!profileForm.first_name.trim() || !profileForm.last_name.trim()) {
      setProfileError("First and last name are required.");
      return;
    }
    setSavingProfile(true);
    setProfileError(null);
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: profileForm.first_name.trim(),
        last_name: profileForm.last_name.trim(),
        role: profileForm.role,
      })
      .eq("id", selected.id);
    if (error) {
      setProfileError(error.message);
      setSavingProfile(false);
      return;
    }
    const updated: Student = { ...selected, ...profileForm };
    setSelected(updated);
    setStudents(prev => prev.map(s => s.id === selected.id ? updated : s));
    setSavingProfile(false);
    setEditingProfile(false);
  }

  // ── Delete student ──────────────────────────────────────────────────────────

  async function deleteStudent() {
    if (!selected) return;
    setDeletingStudent(true);
    // Cascade: delete questions → tests → profile
    await supabase.from("questions").delete().eq("user_id", selected.id);
    await supabase.from("tests").delete().eq("user_id", selected.id);
    await supabase.from("profiles").delete().eq("id", selected.id);
    setStudents(prev => prev.filter(s => s.id !== selected.id));
    setSelected(null);
    setTests([]);
    setConfirmDeleteStudent(false);
    setDeletingStudent(false);
  }

  // ── Test actions ────────────────────────────────────────────────────────────

  async function confirmTestAction() {
    if (!testConfirm || !selected) return;
    setProcessingTest(true);
    const { id: testId, action } = testConfirm;

    if (action === "delete") {
      await supabase.from("questions").delete().eq("test_id", testId).eq("user_id", selected.id);
      await supabase.from("tests").delete().eq("id", testId);
      setTests(prev => prev.filter(t => t.id !== testId));
      setQuestionStats(prev => { const n = { ...prev }; delete n[testId]; return n; });
      setAnalysis(prev => { const n = { ...prev }; delete n[testId]; return n; });
      if (expandedTest === testId) setExpandedTest(null);
    } else {
      // Reset: wipe answers + score so student can retake
      await supabase.from("questions").delete().eq("test_id", testId).eq("user_id", selected.id);
      await supabase.from("tests").update({ score: null }).eq("id", testId);
      setTests(prev => prev.map(t => t.id === testId ? { ...t, score: null } : t));
      setQuestionStats(prev => { const n = { ...prev }; delete n[testId]; return n; });
      setAnalysis(prev => { const n = { ...prev }; delete n[testId]; return n; });
      if (expandedTest === testId) setExpandedTest(null);
    }
    setTestConfirm(null);
    setProcessingTest(false);
  }

  const filtered = students.filter(s =>
    `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  const completedTests = tests.filter(t => t.score !== null);

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Student list ── */}
      <div className="w-64 shrink-0 flex flex-col border-r border-zinc-800/80 bg-zinc-950">
        <div className="px-4 py-4 border-b border-zinc-800/80">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white">Students</h2>
            <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-medium">{students.length}</span>
          </div>
          <input
            type="search"
            placeholder="Search by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-colors"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="px-4 py-5 text-xs text-zinc-600">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-5 text-xs text-zinc-600">No students found.</p>
          ) : filtered.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => selectStudent(s)}
              className={`w-full text-left px-4 py-3 border-b border-zinc-800/40 transition-colors ${
                selected?.id === s.id
                  ? "bg-amber-500/8 border-l-2 border-l-amber-500"
                  : "hover:bg-zinc-900/70 border-l-2 border-l-transparent"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-400 shrink-0">
                  {s.first_name[0]}{s.last_name[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-100 truncate">{s.first_name} {s.last_name}</p>
                  <p className="text-xs text-zinc-600 capitalize">{s.role}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Detail panel ── */}
      <div className="flex-1 overflow-y-auto bg-zinc-950">
        {!selected ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center flex flex-col items-center gap-2">
              <svg className="w-10 h-10 text-zinc-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <p className="text-sm text-zinc-600">Select a student to view their profile</p>
            </div>
          </div>
        ) : (
          <div className="p-6 flex flex-col gap-5 max-w-4xl">

            {/* ── Student header card ── */}
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-lg font-bold text-amber-400 shrink-0">
                  {selected.first_name[0]}{selected.last_name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-white">{selected.first_name} {selected.last_name}</h3>
                  <span className="text-xs font-semibold text-amber-500 capitalize">{selected.role}</span>
                </div>
                <div className="flex gap-4 shrink-0 items-center">
                  <div className="text-center">
                    <p className="text-xl font-bold text-white">{tests.length}</p>
                    <p className="text-xs text-zinc-600">Tests</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-emerald-400">{completedTests.length}</p>
                    <p className="text-xs text-zinc-600">Completed</p>
                  </div>
                  <div className="flex flex-col gap-1.5 ml-2">
                    <button
                      type="button"
                      onClick={openEditProfile}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit Profile
                    </button>
                    {!confirmDeleteStudent ? (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteStudent(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:text-red-400 hover:bg-red-500/8 border border-transparent hover:border-red-500/20 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete Student
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-red-400">Delete all data?</span>
                        <button
                          type="button"
                          onClick={deleteStudent}
                          disabled={deletingStudent}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50"
                        >
                          {deletingStudent ? "…" : "Confirm"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteStudent(false)}
                          className="px-2 py-1 rounded-lg text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Test history ── */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-600 mb-3">Test & Practice History</p>
              {loadingTests ? (
                <p className="text-xs text-zinc-700 py-4">Loading…</p>
              ) : tests.length === 0 ? (
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 px-5 py-8 text-center text-sm text-zinc-600">
                  No tests or practices taken yet.
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {tests.map(test => {
                    const stats = questionStats[test.id];
                    const correct = stats?.filter(q => q.is_correct === true).length ?? 0;
                    const pct = stats ? Math.round((correct / test.total_questions) * 100) : null;
                    const ai = analysis[test.id];
                    const isExpanded = expandedTest === test.id;
                    const isConfirming = testConfirm?.id === test.id;

                    return (
                      <div key={test.id} className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">

                        {/* Row header */}
                        <div className="flex items-center gap-3 px-4 py-3.5">
                          {/* Expand toggle */}
                          <button
                            type="button"
                            onClick={() => expandTest(test)}
                            className="flex-1 text-left min-w-0"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <svg className={`w-3.5 h-3.5 text-zinc-600 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              <p className="text-sm font-semibold text-zinc-100 truncate">{test.test_name || "Untitled"}</p>
                            </div>
                            <p className="text-xs text-zinc-600 mt-0.5 ml-5">
                              {new Date(test.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              {" · "}{test.total_questions} Qs{" · "}{formatDuration(test.duration)}
                              {pct !== null && <span className="text-amber-400 font-semibold ml-1.5">{pct}% correct</span>}
                            </p>
                          </button>

                          {/* Status */}
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border shrink-0 ${
                            test.score !== null
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          }`}>
                            {test.score !== null ? "Completed" : "In Progress"}
                          </span>

                          {/* Completed test actions */}
                          {test.score !== null && (
                            <>
                              <button
                                type="button"
                                onClick={() => setResultsModal({ testID: test.id, userID: selected!.id })}
                                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 hover:bg-zinc-800 transition-colors shrink-0"
                              >
                                View Results
                              </button>
                              <button
                                type="button"
                                onClick={() => runAnalysis(test)}
                                disabled={ai === "loading"}
                                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-amber-500/20 text-amber-400 bg-amber-500/5 hover:bg-amber-500/10 transition-colors disabled:opacity-40 shrink-0"
                              >
                                {ai === "loading" ? "Analyzing…" : typeof ai === "object" ? "Re-analyze" : "AI Analysis"}
                              </button>
                            </>
                          )}

                          {/* Reset / Delete — inline confirm */}
                          {isConfirming ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-xs text-zinc-500">
                                {testConfirm.action === "delete" ? "Delete test?" : "Reset progress?"}
                              </span>
                              <button
                                type="button"
                                onClick={confirmTestAction}
                                disabled={processingTest}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold text-white transition-colors disabled:opacity-50 ${testConfirm.action === "delete" ? "bg-red-600 hover:bg-red-500" : "bg-amber-600 hover:bg-amber-500"}`}
                              >
                                {processingTest ? "…" : "Confirm"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setTestConfirm(null)}
                                className="px-2 py-1 rounded-lg text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-1 shrink-0">
                              <button
                                type="button"
                                title="Reset test — clears all answers so student can retake"
                                onClick={() => setTestConfirm({ id: test.id, action: "reset" })}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:text-amber-400 hover:bg-amber-500/8 border border-transparent hover:border-amber-500/20 transition-colors"
                              >
                                Reset
                              </button>
                              <button
                                type="button"
                                title="Permanently delete this test and all its answers"
                                onClick={() => setTestConfirm({ id: test.id, action: "delete" })}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:text-red-400 hover:bg-red-500/8 border border-transparent hover:border-red-500/20 transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Question breakdown */}
                        {isExpanded && stats && (
                          <div className="border-t border-zinc-800 px-5 py-4">
                            <p className="text-xs font-bold uppercase tracking-widest text-zinc-600 mb-3">Question Breakdown</p>
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              {Array.from({ length: test.total_questions }, (_, i) => {
                                const q = stats.find(s => s.order_index === i + 1);
                                const englishCount = test.configuration?.english?.count ?? Math.floor(test.total_questions / 2);
                                const isEla = i < englishCount;
                                return (
                                  <div
                                    key={i}
                                    title={`Q${i + 1} · ${isEla ? "ELA" : "Math"} · ${q?.is_correct === true ? "Correct" : q?.is_correct === false ? "Incorrect" : "Skipped"}`}
                                    className={`w-6 h-6 rounded flex items-center justify-center text-xs font-mono font-bold ${
                                      q?.is_correct === true
                                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                        : q?.is_correct === false
                                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                        : "bg-zinc-800 text-zinc-600 border border-zinc-700"
                                    }`}
                                  >
                                    {i + 1}
                                  </div>
                                );
                              })}
                            </div>
                            <div className="flex gap-3 text-xs text-zinc-500">
                              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500/50 inline-block" />{correct} correct</span>
                              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500/50 inline-block" />{stats.filter(q => q.is_correct === false).length} incorrect</span>
                              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-zinc-700 inline-block" />{test.total_questions - stats.length} skipped</span>
                            </div>
                          </div>
                        )}

                        {/* AI analysis cards */}
                        {typeof ai === "object" && ai !== null && (
                          <div className="border-t border-zinc-800 px-5 py-4 grid grid-cols-3 gap-3">
                            {(["strengths", "improvements", "recommendations"] as const).map(key => {
                              const labels = { strengths: "Strengths", improvements: "Areas to Improve", recommendations: "Recommendations" };
                              const c = ANALYSIS_COLORS[key];
                              return (
                                <div key={key} className={`rounded-lg p-3 border ${c.card}`}>
                                  <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${c.title}`}>{labels[key]}</p>
                                  <ul className="flex flex-col gap-1">
                                    {ai[key].map((item, i) => (
                                      <li key={i} className={`text-xs flex gap-1.5 ${c.text}`}>
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
                        {ai === "error" && (
                          <div className="border-t border-zinc-800 px-5 py-3 text-xs text-red-400">
                            Analysis failed. Try again.
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

      {/* ── Results Modal ── */}
      {resultsModal && (
        <ResultsModal
          testID={resultsModal.testID}
          userID={resultsModal.userID}
          onClose={() => setResultsModal(null)}
        />
      )}

      {/* ── Edit Profile Modal ── */}
      {editingProfile && selected && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col">
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Edit Profile</h3>
              <button
                type="button"
                onClick={() => setEditingProfile(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <DarkInput
                  label="First Name"
                  value={profileForm.first_name}
                  onChange={v => setProfileForm(f => ({ ...f, first_name: v }))}
                />
                <DarkInput
                  label="Last Name"
                  value={profileForm.last_name}
                  onChange={v => setProfileForm(f => ({ ...f, last_name: v }))}
                />
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Role</span>
                <select
                  value={profileForm.role}
                  onChange={e => setProfileForm(f => ({ ...f, role: e.target.value }))}
                  title="Role"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/60 transition-colors"
                >
                  <option value="student">Student</option>
                  <option value="parent">Parent</option>
                </select>
              </label>
              {profileError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{profileError}</p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setEditingProfile(false)}
                className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveProfile}
                disabled={savingProfile}
                className="px-5 py-2 rounded-lg text-sm font-bold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-colors disabled:opacity-50"
              >
                {savingProfile ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
