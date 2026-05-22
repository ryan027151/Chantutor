import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase-client";
import ResultsModal from "./ResultsModal";

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  last_sign_in_at: string | null;
  created_at: string;
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
    title: "text-emerald-600",
    bullet: "text-emerald-500",
    text: "text-emerald-800",
  },
  improvements: {
    card: "bg-amber-500/5 border-amber-500/15",
    title: "text-amber-600",
    bullet: "text-amber-500",
    text: "text-amber-800",
  },
  recommendations: {
    card: "bg-blue-500/5 border-blue-500/15",
    title: "text-blue-600",
    bullet: "text-blue-500",
    text: "text-blue-800",
  },
} as const;

function formatDuration(min: number) {
  if (min === 0) return "Untimed";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}` : `${m}m`;
}

function inactivityMonths(s: Student): number {
  const ref = s.last_sign_in_at ?? s.created_at;
  return (Date.now() - new Date(ref).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}

function inactivityDot(months: number): string {
  if (months < 3) return "bg-emerald-500";
  if (months < 5) return "bg-yellow-400";
  if (months < 5.5) return "bg-orange-500";
  return "bg-red-500";
}

function deletionDate(s: Student): Date {
  const ref = new Date(s.last_sign_in_at ?? s.created_at);
  return new Date(ref.getTime() + 6 * 30.44 * 24 * 60 * 60 * 1000);
}

function AdminInput({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold uppercase tracking-widest text-zinc-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-base text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/25 transition-colors"
      />
    </label>
  );
}

export default function AdminStudentsPanel() {
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<Student | null>(null);
  const [tests, setTests] = useState<TestRecord[]>([]);
  const [loadingTests, setLoadingTests] = useState(false);
  const [linkedParents, setLinkedParents] = useState<{ id: string; first_name: string; last_name: string }[]>([]);

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
      .select("id, first_name, last_name, role, last_sign_in_at, created_at")
      .eq("role", "student")
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
    setLinkedParents([]);
    setLoadingTests(true);

    const [{ data: testsData }, { data: parentLinks }] = await Promise.all([
      supabase
        .from("tests")
        .select("id, test_name, created_at, score, duration, total_questions, configuration")
        .eq("user_id", s.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("student_parents")
        .select("parent_id")
        .eq("student_id", s.id),
    ]);

    setTests((testsData as TestRecord[]) ?? []);

    const parentIds = (parentLinks ?? []).map((l: { parent_id: string }) => l.parent_id);
    if (parentIds.length > 0) {
      const { data: parentProfiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", parentIds);
      setLinkedParents((parentProfiles ?? []) as { id: string; first_name: string; last_name: string }[]);
    }

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

  async function deleteStudent() {
    if (!selected) return;
    setDeletingStudent(true);
    await supabase.from("questions").delete().eq("user_id", selected.id);
    await supabase.from("tests").delete().eq("user_id", selected.id);
    await supabase.from("profiles").delete().eq("id", selected.id);
    setStudents(prev => prev.filter(s => s.id !== selected.id));
    setSelected(null);
    setTests([]);
    setConfirmDeleteStudent(false);
    setDeletingStudent(false);
  }

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
      <div className="w-64 shrink-0 flex flex-col border-r border-zinc-200 bg-white">
        <div className="px-4 py-4 border-b border-zinc-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-zinc-900">Students</h2>
            <span className="text-sm bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full font-medium">{students.length}</span>
          </div>
          <input
            type="search"
            placeholder="Search by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-base text-zinc-700 placeholder-zinc-400 focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-colors"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="px-4 py-5 text-sm text-zinc-400">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-5 text-sm text-zinc-400">No students found.</p>
          ) : filtered.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => selectStudent(s)}
              className={`w-full text-left px-4 py-3 border-b border-zinc-100 transition-colors ${
                selected?.id === s.id
                  ? "bg-amber-500/8 border-l-2 border-l-amber-500"
                  : "hover:bg-zinc-50 border-l-2 border-l-transparent"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="relative shrink-0">
                  <div className="w-8 h-8 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-sm font-bold text-zinc-500">
                    {s.first_name[0]}{s.last_name[0]}
                  </div>
                  <span
                    title={`Last active: ${inactivityMonths(s) < 1 ? "< 1 month ago" : `${Math.round(inactivityMonths(s))} months ago`}`}
                    className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${inactivityDot(inactivityMonths(s))}`}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-base font-semibold text-zinc-900 truncate">{s.first_name} {s.last_name}</p>
                  <p className="text-sm text-zinc-400 capitalize">{s.role}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Detail panel ── */}
      <div className="flex-1 overflow-y-auto bg-white">
        {!selected ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center flex flex-col items-center gap-2">
              <svg className="w-10 h-10 text-zinc-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <p className="text-base text-zinc-400">Select a student to view their profile</p>
            </div>
          </div>
        ) : (
          <div className="p-6 flex flex-col gap-5 max-w-4xl">

            {/* ── Student header card ── */}
            <div className="bg-zinc-50 rounded-xl border border-zinc-200 p-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-lg font-bold text-amber-400 shrink-0">
                  {selected.first_name[0]}{selected.last_name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-zinc-900">{selected.first_name} {selected.last_name}</h3>
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    <span className="text-sm font-semibold text-amber-500 capitalize">{selected.role}</span>
                    {(() => {
                      const mo = inactivityMonths(selected);
                      const moRounded = Math.round(mo);
                      const lastSeenLabel = mo < 1
                        ? "Last seen: less than 1 month ago"
                        : `Last seen: ${moRounded} month${moRounded !== 1 ? "s" : ""} ago`;
                      const dot = inactivityDot(mo);
                      return (
                        <span className={`flex items-center gap-1 text-sm ${
                          mo >= 5.5 ? "text-red-400" : mo >= 5 ? "text-orange-400" : mo >= 3 ? "text-yellow-500" : "text-zinc-400"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full inline-block ${dot}`} />
                          {lastSeenLabel}
                        </span>
                      );
                    })()}
                  </div>
                  {inactivityMonths(selected) >= 5 && (() => {
                    const del = deletionDate(selected);
                    const isPast = del <= new Date();
                    const mo = inactivityMonths(selected);
                    return (
                      <div className={`mt-2 text-sm rounded-lg px-3 py-2 border flex items-center gap-2 ${
                        mo >= 5.5
                          ? "bg-red-500/8 border-red-500/20 text-red-400"
                          : "bg-orange-500/8 border-orange-500/20 text-orange-400"
                      }`}>
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                        {isPast
                          ? "Auto-deletion overdue — will be removed on next cleanup cycle (Sundays 3am UTC)."
                          : `Account scheduled for auto-deletion on ${del.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`
                        }
                      </div>
                    );
                  })()}
                </div>
                <div className="flex gap-4 shrink-0 items-center">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-zinc-900">{tests.length}</p>
                    <p className="text-sm text-zinc-400">Tests</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-emerald-500">{completedTests.length}</p>
                    <p className="text-sm text-zinc-400">Completed</p>
                  </div>
                  <div className="flex flex-col gap-1.5 ml-2">
                    <button
                      type="button"
                      onClick={openEditProfile}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 hover:border-zinc-300 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit Profile
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/performance/${selected.id}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 hover:border-zinc-300 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      View Performance
                    </button>
                    {!confirmDeleteStudent ? (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteStudent(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-400 hover:text-red-400 hover:bg-red-500/8 border border-transparent hover:border-red-500/20 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete Student
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm text-red-400">Delete all data?</span>
                        <button
                          type="button"
                          onClick={deleteStudent}
                          disabled={deletingStudent}
                          className="px-2.5 py-1 rounded-lg text-sm font-bold bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50"
                        >
                          {deletingStudent ? "…" : "Confirm"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteStudent(false)}
                          className="px-2 py-1 rounded-lg text-sm text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Linked parents ── */}
            {linkedParents.length > 0 && (
              <div className="bg-zinc-50 rounded-xl border border-zinc-200 px-5 py-4">
                <p className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-3">Linked Parents</p>
                <div className="flex flex-col gap-2">
                  {linkedParents.map(p => (
                    <div key={p.id} className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-sm font-bold text-zinc-500 shrink-0">
                        {p.first_name[0]}{p.last_name[0]}
                      </div>
                      <span className="text-base text-zinc-700">{p.first_name} {p.last_name}</span>
                      <span className="ml-auto text-sm text-zinc-400 capitalize">parent</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Test history ── */}
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-3">Test & Practice History</p>
              {loadingTests ? (
                <p className="text-sm text-zinc-400 py-4">Loading…</p>
              ) : tests.length === 0 ? (
                <div className="bg-zinc-50 rounded-xl border border-zinc-200 px-5 py-8 text-center text-base text-zinc-400">
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
                      <div key={test.id} className="bg-zinc-50 rounded-xl border border-zinc-200 overflow-hidden">

                        {/* Row header */}
                        <div className="flex items-center gap-3 px-4 py-3.5">
                          <button
                            type="button"
                            onClick={() => expandTest(test)}
                            className="flex-1 text-left min-w-0"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <svg className={`w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              <p className="text-base font-semibold text-zinc-900 truncate">{test.test_name || "Untitled"}</p>
                            </div>
                            <p className="text-sm text-zinc-400 mt-0.5 ml-5">
                              {new Date(test.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              {" · "}{test.total_questions} Qs{" · "}{formatDuration(test.duration)}
                              {pct !== null && <span className="text-amber-500 font-semibold ml-1.5">{pct}% correct</span>}
                            </p>
                          </button>

                          <span className={`text-sm font-medium px-2.5 py-1 rounded-full border shrink-0 ${
                            test.score !== null
                              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                          }`}>
                            {test.score !== null ? "Completed" : "In Progress"}
                          </span>

                          {test.score !== null && (
                            <>
                              <button
                                type="button"
                                onClick={() => setResultsModal({ testID: test.id, userID: selected!.id })}
                                className="text-sm font-medium px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:border-zinc-300 hover:bg-zinc-100 transition-colors shrink-0"
                              >
                                View Results
                              </button>
                              <button
                                type="button"
                                onClick={() => runAnalysis(test)}
                                disabled={ai === "loading"}
                                className="text-sm font-medium px-3 py-1.5 rounded-lg border border-amber-500/20 text-amber-500 bg-amber-500/5 hover:bg-amber-500/10 transition-colors disabled:opacity-40 shrink-0"
                              >
                                {ai === "loading" ? "Analyzing…" : typeof ai === "object" ? "Re-analyze" : "AI Analysis"}
                              </button>
                            </>
                          )}

                          {isConfirming ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-sm text-zinc-500">
                                {testConfirm.action === "delete" ? "Delete test?" : "Reset progress?"}
                              </span>
                              <button
                                type="button"
                                onClick={confirmTestAction}
                                disabled={processingTest}
                                className={`px-2.5 py-1 rounded-lg text-sm font-bold text-white transition-colors disabled:opacity-50 ${testConfirm.action === "delete" ? "bg-red-600 hover:bg-red-500" : "bg-amber-600 hover:bg-amber-500"}`}
                              >
                                {processingTest ? "…" : "Confirm"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setTestConfirm(null)}
                                className="px-2 py-1 rounded-lg text-sm text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
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
                                className="px-2.5 py-1.5 rounded-lg text-sm font-medium text-zinc-400 hover:text-amber-500 hover:bg-amber-500/8 border border-transparent hover:border-amber-500/20 transition-colors"
                              >
                                Reset
                              </button>
                              <button
                                type="button"
                                title="Permanently delete this test and all its answers"
                                onClick={() => setTestConfirm({ id: test.id, action: "delete" })}
                                className="px-2.5 py-1.5 rounded-lg text-sm font-medium text-zinc-400 hover:text-red-400 hover:bg-red-500/8 border border-transparent hover:border-red-500/20 transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Question breakdown */}
                        {isExpanded && stats && (
                          <div className="border-t border-zinc-200 px-5 py-4">
                            <p className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-3">Question Breakdown</p>
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              {Array.from({ length: test.total_questions }, (_, i) => {
                                const q = stats.find(s => s.order_index === i + 1);
                                const englishCount = test.configuration?.english?.count ?? Math.floor(test.total_questions / 2);
                                const isEla = i < englishCount;
                                return (
                                  <div
                                    key={i}
                                    title={`Q${i + 1} · ${isEla ? "English" : "Math"} · ${q?.is_correct === true ? "Correct" : q?.is_correct === false ? "Incorrect" : "Skipped"}`}
                                    className={`w-6 h-6 rounded flex items-center justify-center text-sm font-mono font-bold ${
                                      q?.is_correct === true
                                        ? "bg-emerald-500/20 text-emerald-600 border border-emerald-500/30"
                                        : q?.is_correct === false
                                        ? "bg-red-500/20 text-red-500 border border-red-500/30"
                                        : "bg-zinc-100 text-zinc-400 border border-zinc-200"
                                    }`}
                                  >
                                    {i + 1}
                                  </div>
                                );
                              })}
                            </div>
                            <div className="flex gap-3 text-sm text-zinc-500">
                              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500/50 inline-block" />{correct} correct</span>
                              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500/50 inline-block" />{stats.filter(q => q.is_correct === false).length} incorrect</span>
                              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-zinc-300 inline-block" />{test.total_questions - stats.length} skipped</span>
                            </div>
                          </div>
                        )}

                        {/* AI analysis cards */}
                        {typeof ai === "object" && ai !== null && (
                          <div className="border-t border-zinc-200 px-5 py-4 grid grid-cols-3 gap-3">
                            {(["strengths", "improvements", "recommendations"] as const).map(key => {
                              const labels = { strengths: "Strengths", improvements: "Areas to Improve", recommendations: "Recommendations" };
                              const c = ANALYSIS_COLORS[key];
                              return (
                                <div key={key} className={`rounded-lg p-3 border ${c.card}`}>
                                  <p className={`text-sm font-bold uppercase tracking-wider mb-2 ${c.title}`}>{labels[key]}</p>
                                  <ul className="flex flex-col gap-1">
                                    {ai[key].map((item, i) => (
                                      <li key={i} className={`text-sm flex gap-1.5 ${c.text}`}>
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
                          <div className="border-t border-zinc-200 px-5 py-3 text-sm text-red-400">
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
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-zinc-200 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col">
            <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-900">Edit Profile</h3>
              <button
                type="button"
                onClick={() => setEditingProfile(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <AdminInput
                  label="First Name"
                  value={profileForm.first_name}
                  onChange={v => setProfileForm(f => ({ ...f, first_name: v }))}
                />
                <AdminInput
                  label="Last Name"
                  value={profileForm.last_name}
                  onChange={v => setProfileForm(f => ({ ...f, last_name: v }))}
                />
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-bold uppercase tracking-widest text-zinc-500">Role</span>
                <select
                  value={profileForm.role}
                  onChange={e => setProfileForm(f => ({ ...f, role: e.target.value }))}
                  title="Role"
                  className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-base text-zinc-900 focus:outline-none focus:border-amber-500/60 transition-colors"
                >
                  <option value="student">Student</option>
                  <option value="parent">Parent</option>
                </select>
              </label>
              {profileError && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{profileError}</p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-zinc-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setEditingProfile(false)}
                className="px-4 py-2 rounded-lg text-base text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveProfile}
                disabled={savingProfile}
                className="px-5 py-2 rounded-lg text-base font-bold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-colors disabled:opacity-50"
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
