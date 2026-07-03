import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase-client";
import ResultsModal from "./ResultsModal";

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  email: string | null;
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

interface ProfileForm {
  first_name: string;
  last_name: string;
  role: string;
}

interface Assignment {
  id: string;
  test_type: "mock" | "practice";
  num_questions: number | null;
  difficulties: string[] | null;
  categories: string[] | null;
  due_date: string | null;
  duration_minutes: number | null;
  note: string | null;
  status: "pending" | "completed";
  test_id: string | null;
  created_at: string;
  tests: { score: number | null } | null;
}

interface AssignForm {
  test_type: "mock" | "practice";
  num_questions: string;
  difficulties: string[];
  categories: string[];
  due_date: string;
  due_time: string;
  timed: boolean;
  dur_h: string;
  dur_m: string;
  note: string;
}

const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
const DEFAULT_ASSIGN: AssignForm = {
  test_type: "mock", num_questions: "20", difficulties: [], categories: [],
  due_date: "", due_time: "23:59", timed: false, dur_h: "0", dur_m: "0", note: "",
};

function formatDuration(min: number) {
  if (min === 0) return "Untimed";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}` : `${m}m`;
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

export default function AdminStudentsPanel({ isAdmin = true }: { isAdmin?: boolean }) {
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

  // Edit profile
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileForm>({ first_name: "", last_name: "", role: "student" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Delete student
  const [confirmDeleteStudent, setConfirmDeleteStudent] = useState(false);
  const [deletingStudent, setDeletingStudent] = useState(false);

  // Per-test actions
  const [testConfirm, setTestConfirm] = useState<{ id: string; action: "delete" | "reset" } | null>(null);
  const [processingTest, setProcessingTest] = useState(false);

  // Results modal
  const [resultsModal, setResultsModal] = useState<{ testID: string; userID: string; studentName: string } | null>(null);

  // Assignments
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTopics, setAssignTopics] = useState<Record<string, string[]>>({});
  const [assignForm, setAssignForm] = useState<AssignForm>(DEFAULT_ASSIGN);
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignWarning, setAssignWarning] = useState<string | null>(null);
  const [confirmDeleteAssign, setConfirmDeleteAssign] = useState<string | null>(null);

  async function loadStudents() {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_all_profiles");
    if (!error && data) {
      setStudents((data as Student[]).filter(s => s.role === "student"));
    }
    setLoading(false);
  }

  useEffect(() => { loadStudents(); }, []);

  async function selectStudent(s: Student) {
    setSelected(s);
    setTests([]);
    setAssignments([]);
    setExpandedTest(null);
    setQuestionStats({});
    setConfirmDeleteStudent(false);
    setEditingProfile(false);
    setLinkedParents([]);
    setLoadingTests(true);

    const [{ data: testsData }, { data: parentLinks }, { data: assignData }] = await Promise.all([
      supabase
        .from("tests")
        .select("id, test_name, created_at, score, duration, total_questions, configuration")
        .eq("user_id", s.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("student_parents")
        .select("parent_id")
        .eq("student_id", s.id),
      supabase
        .from("assignments")
        .select("*, tests(score)")
        .eq("student_id", s.id)
        .order("created_at", { ascending: false }),
    ]);

    setTests((testsData as TestRecord[]) ?? []);
    setAssignments((assignData as Assignment[]) ?? []);

    const parentIds = (parentLinks ?? []).map((l: { parent_id: string }) => l.parent_id);
    if (parentIds.length > 0) {
      const { data: parentProfiles } = await supabase.rpc("get_all_profiles");
      const filtered = ((parentProfiles ?? []) as Student[]).filter(p => parentIds.includes(p.id));
      setLinkedParents(filtered.map(p => ({ id: p.id, first_name: p.first_name, last_name: p.last_name })));
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
      if (expandedTest === testId) setExpandedTest(null);
    } else {
      await supabase.from("questions").delete().eq("test_id", testId).eq("user_id", selected.id);
      await supabase.from("tests").update({ score: null }).eq("id", testId);
      setTests(prev => prev.map(t => t.id === testId ? { ...t, score: null } : t));
      setQuestionStats(prev => { const n = { ...prev }; delete n[testId]; return n; });
      if (expandedTest === testId) setExpandedTest(null);
    }
    setTestConfirm(null);
    setProcessingTest(false);
  }

  async function openAssignModal() {
    setAssignForm(DEFAULT_ASSIGN);
    setAssignError(null);
    setAssignWarning(null);
    if (Object.keys(assignTopics).length === 0) {
      const { data } = await supabase.from("all_questions").select("sub_category, subject").not("sub_category", "is", null).limit(10000);
      const grouped: Record<string, Set<string>> = {};
      for (const q of (data ?? []) as { sub_category: string; subject: string | null }[]) {
        if (!q.sub_category) continue;
        const subj = q.subject ?? "Other";
        if (!grouped[subj]) grouped[subj] = new Set();
        grouped[subj].add(q.sub_category);
      }
      const result: Record<string, string[]> = {};
      const order = Object.keys(grouped).sort((a, b) => {
        const ai = a.toLowerCase().includes("english") ? 0 : a.toLowerCase().includes("math") ? 1 : 2;
        const bi = b.toLowerCase().includes("english") ? 0 : b.toLowerCase().includes("math") ? 1 : 2;
        return ai - bi;
      });
      for (const subj of order) result[subj] = [...grouped[subj]].sort();
      setAssignTopics(result);
    }
    setShowAssignModal(true);
  }

  async function saveAssignment() {
    if (!selected) return;
    const numQ = assignForm.test_type === "practice" ? parseInt(assignForm.num_questions, 10) : 114;
    if (assignForm.test_type === "practice" && (isNaN(numQ) || numQ < 1 || !Number.isInteger(numQ))) {
      setAssignError("# of questions must be a positive whole number.");
      return;
    }
    const durMin = assignForm.timed ? parseInt(assignForm.dur_h, 10) * 60 + parseInt(assignForm.dur_m, 10) : null;
    if (assignForm.timed && (!durMin || durMin <= 0)) {
      setAssignError("Duration must be greater than 0 minutes.");
      return;
    }
    // Warn if selected categories don't have enough approved questions
    if (assignForm.test_type === "practice" && assignForm.categories.length > 0) {
      const { count } = await supabase
        .from("all_questions")
        .select("uid", { count: "exact", head: true })
        .eq("status", "approved")
        .in("sub_category", assignForm.categories);
      const available = count ?? 0;
      if (available === 0) {
        setAssignError("No approved questions found for the selected categories. Choose different categories.");
        return;
      }
      if (available < numQ) {
        setAssignWarning(`Only ${available} approved question${available === 1 ? "" : "s"} available in these categories (you requested ${numQ}). The test will end when questions run out.`);
      } else {
        setAssignWarning(null);
      }
    } else {
      setAssignWarning(null);
    }

    setAssignSaving(true);
    setAssignError(null);
    const { data: { user: adminUser } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("assignments").insert({
      student_id: selected.id,
      assigned_by: adminUser!.id,
      test_type: assignForm.test_type,
      num_questions: numQ,
      difficulties: assignForm.difficulties.length > 0 ? assignForm.difficulties : null,
      categories: assignForm.test_type === "practice" && assignForm.categories.length > 0 ? assignForm.categories : null,
      due_date: assignForm.due_date ? new Date(`${assignForm.due_date}T${assignForm.due_time || "23:59"}:00`).toISOString() : null,
      duration_minutes: durMin,
      note: assignForm.note.trim() || null,
    }).select().single();
    if (error) { setAssignError(error.message); setAssignSaving(false); return; }
    setAssignments(prev => [data as Assignment, ...prev]);
    setShowAssignModal(false);
    setAssignSaving(false);
  }

  async function deleteAssignment(id: string) {
    await supabase.from("assignments").delete().eq("id", id);
    setAssignments(prev => prev.filter(a => a.id !== id));
    setConfirmDeleteAssign(null);
  }

  const filtered = students.filter(s =>
    `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  const completedTests = tests.filter(t => t.score !== null);

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Student list — hidden below lg when a student is selected ── */}
      <div className={`${selected ? "hidden lg:flex" : "flex"} w-full lg:w-56 xl:w-64 shrink-0 flex-col border-r border-zinc-200 bg-white`}>
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
                <div className="w-8 h-8 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-sm font-bold text-zinc-500 shrink-0">
                  {s.first_name[0]}{s.last_name[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-base font-semibold text-zinc-900 wrap-break-word">{s.first_name} {s.last_name}</p>
                  {s.email && <p className="text-sm text-zinc-400 truncate">{s.email}</p>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Detail panel — hidden below lg until a student is selected ── */}
      <div className={`${!selected ? "hidden lg:flex lg:flex-col" : "flex flex-col"} flex-1 overflow-y-auto bg-white`}>
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
          <div className="p-4 sm:p-6 flex flex-col gap-5 max-w-4xl">
            {/* Back button — shown below lg only */}
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="lg:hidden flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-800 -mb-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              All Students
            </button>

            {/* ── Student header card ── */}
            <div className="bg-zinc-50 rounded-xl border border-zinc-200 p-4 sm:p-5">
              {/* Avatar + name row */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-base sm:text-lg font-bold text-amber-400 shrink-0">
                  {selected.first_name[0]}{selected.last_name[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base sm:text-lg font-bold text-zinc-900 wrap-break-word">{selected.first_name} {selected.last_name}</h3>
                  <div className="flex items-center gap-2 mt-0.5 min-w-0">
                    <span className="text-xs sm:text-sm font-semibold text-amber-500 capitalize shrink-0">{selected.role}</span>
                    {selected.email && (
                      <span className="text-xs text-zinc-400 truncate">{selected.email}</span>
                    )}
                  </div>
                </div>
              </div>
              {/* Stats row — always below the name */}
              <div className="flex gap-4 mt-3 pt-3 border-t border-zinc-200">
                <div>
                  <span className="text-xl font-bold text-zinc-900">{tests.length}</span>
                  <span className="text-xs text-zinc-400 ml-1">Tests</span>
                </div>
                <div>
                  <span className="text-xl font-bold text-emerald-500">{completedTests.length}</span>
                  <span className="text-xs text-zinc-400 ml-1">Done</span>
                </div>
              </div>
              {/* Actions row */}
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {isAdmin && (
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
                )}
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
                <button
                  type="button"
                  onClick={openAssignModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-blue-600 bg-blue-500/8 hover:bg-blue-500/15 border border-blue-500/20 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Assign Work
                </button>
                {isAdmin && (!confirmDeleteStudent ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteStudent(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-400 hover:text-red-400 hover:bg-red-500/8 border border-transparent hover:border-red-500/20 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete
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
                ))}
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

            {/* ── Assigned Work ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold uppercase tracking-widest text-zinc-400">Assigned Work</p>
                <button
                  type="button"
                  onClick={openAssignModal}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-blue-600 bg-blue-500/8 hover:bg-blue-500/15 border border-blue-500/20 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Assign
                </button>
              </div>
              {assignments.length === 0 ? (
                <div className="bg-zinc-50 rounded-xl border border-zinc-200 px-5 py-6 text-center text-sm text-zinc-400">
                  No assignments yet. Click "Assign" to create one.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {assignments.map(a => {
                    const isDue = a.due_date && new Date(a.due_date) < new Date();
                    const isConfirmingDelete = confirmDeleteAssign === a.id;
                    const score = a.tests?.score ?? null;
                    const isCompleted = a.status === "completed" || score !== null;
                    const isInProgress = !isCompleted && a.test_id !== null;
                    const statusLabel = isCompleted ? "Completed" : isInProgress ? "In Progress" : isDue ? "Overdue" : "Pending";
                    const statusCls = isCompleted
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                      : isInProgress
                        ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                        : isDue
                          ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
                          : "bg-amber-500/10 text-amber-600 border-amber-500/20";
                    const cardCls = `rounded-xl border px-4 py-3 flex flex-col gap-1.5 ${
                      isCompleted ? "border-emerald-200 bg-emerald-50/30" :
                      isInProgress ? "border-blue-200 bg-blue-50/30" :
                      isDue ? "border-rose-200 bg-rose-50/40" :
                      "border-zinc-200 bg-zinc-50"
                    }`;
                    return (
                      <div key={a.id} className={cardCls}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-col gap-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${a.test_type === "mock" ? "bg-violet-500/10 text-violet-600 border-violet-500/20" : "bg-blue-500/10 text-blue-600 border-blue-500/20"}`}>
                                {a.test_type === "mock" ? "Mock Test" : "Practice"}
                              </span>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusCls}`}>
                                {statusLabel}
                              </span>
                              {isCompleted && score !== null && (
                                <span className="text-xs font-bold text-emerald-700">{score}%</span>
                              )}
                            </div>
                            <div className="text-sm text-zinc-600 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                              <span>{a.test_type === "mock" ? "114 questions" : `${a.num_questions ?? "?"} questions`}</span>
                              {a.duration_minutes && <span>· {Math.floor(a.duration_minutes / 60) > 0 ? `${Math.floor(a.duration_minutes / 60)}h ` : ""}{a.duration_minutes % 60 > 0 ? `${a.duration_minutes % 60}m` : ""} limit</span>}
                              {a.due_date && <span className={isDue && !isCompleted ? "text-rose-500 font-medium" : "text-zinc-400"}>· Due {new Date(a.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>}
                            </div>
                            {a.categories && a.categories.length > 0 && (
                              <p className="text-xs text-zinc-400 truncate">Topics: {a.categories.join(", ")}</p>
                            )}
                            {a.difficulties && a.difficulties.length > 0 && (
                              <p className="text-xs text-zinc-400">Difficulty: {a.difficulties.join(", ")}</p>
                            )}
                            {a.note && (
                              <p className="text-xs text-zinc-500 italic">"{a.note}"</p>
                            )}
                          </div>
                          <div className="shrink-0 flex flex-col items-end gap-1">
                            {isCompleted && a.test_id && (
                              <button
                                type="button"
                                onClick={() => navigate(`/results/${a.test_id}?studentId=${selected!.id}`)}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                              >
                                View Results
                              </button>
                            )}
                            {isConfirmingDelete ? (
                              <div className="flex items-center gap-1">
                                <button type="button" onClick={() => deleteAssignment(a.id)} className="px-2 py-0.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition-colors">Delete</button>
                                <button type="button" onClick={() => setConfirmDeleteAssign(null)} className="px-1.5 py-0.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors">✕</button>
                              </div>
                            ) : (
                              <button type="button" onClick={() => setConfirmDeleteAssign(a.id)} className="text-xs text-zinc-300 hover:text-red-400 transition-colors px-1 py-1">✕</button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

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
                    const isExpanded = expandedTest === test.id;
                    const isConfirming = testConfirm?.id === test.id;

                    return (
                      <div key={test.id} className="bg-zinc-50 rounded-xl border border-zinc-200 overflow-hidden">

                        {/* Row header */}
                        <div className="px-4 py-3 flex flex-col gap-2">
                          {/* Test name — always full width */}
                          <button
                            type="button"
                            onClick={() => expandTest(test)}
                            className="w-full text-left"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <svg className={`w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              <p className="text-sm font-semibold text-zinc-900 truncate">{test.test_name || "Untitled"}</p>
                            </div>
                            <p className="text-xs text-zinc-400 mt-0.5 ml-5">
                              {new Date(test.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              {" · "}{test.total_questions} Qs{" · "}{formatDuration(test.duration)}
                              {pct !== null && <span className="text-amber-500 font-semibold ml-1.5">{pct}% correct</span>}
                            </p>
                          </button>

                          {/* Actions row — status + buttons all on one line */}
                          <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 ${
                            test.score !== null
                              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                          }`}>
                            {test.score !== null ? "Completed" : "In Progress"}
                          </span>

                          {test.score !== null && (
                            <button
                              type="button"
                              onClick={() => setResultsModal({ testID: test.id, userID: selected!.id, studentName: `${selected!.first_name} ${selected!.last_name}` })}
                              className="text-xs font-medium px-2.5 py-1 rounded-lg border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:border-zinc-300 hover:bg-zinc-100 transition-colors shrink-0"
                            >
                              View Results
                            </button>
                          )}

                          {isAdmin && (isConfirming ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-xs text-zinc-500">
                                {testConfirm.action === "delete" ? "Delete?" : "Reset?"}
                              </span>
                              <button
                                type="button"
                                onClick={confirmTestAction}
                                disabled={processingTest}
                                className={`px-2 py-0.5 rounded-lg text-xs font-bold text-white transition-colors disabled:opacity-50 ${testConfirm.action === "delete" ? "bg-red-600 hover:bg-red-500" : "bg-amber-600 hover:bg-amber-500"}`}
                              >
                                {processingTest ? "…" : "Confirm"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setTestConfirm(null)}
                                className="px-1.5 py-0.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-1 ml-auto shrink-0">
                              <button
                                type="button"
                                title="Reset test — clears all answers so student can retake"
                                onClick={() => setTestConfirm({ id: test.id, action: "reset" })}
                                className="px-2 py-1 rounded-lg text-xs font-medium text-zinc-400 hover:text-amber-500 hover:bg-amber-500/8 border border-transparent hover:border-amber-500/20 transition-colors"
                              >
                                Reset
                              </button>
                              <button
                                type="button"
                                title="Permanently delete this test and all its answers"
                                onClick={() => setTestConfirm({ id: test.id, action: "delete" })}
                                className="px-2 py-1 rounded-lg text-xs font-medium text-zinc-400 hover:text-red-400 hover:bg-red-500/8 border border-transparent hover:border-red-500/20 transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          ))}
                          </div>
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
          studentName={resultsModal.studentName}
          onClose={() => setResultsModal(null)}
        />
      )}

      {/* ── Assign Work Modal ── */}
      {showAssignModal && selected && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-zinc-200 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col overflow-y-auto max-h-[92vh]">
            <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-bold text-zinc-900">Assign Work</h3>
                <p className="text-sm text-zinc-400 mt-0.5">For {selected.first_name} {selected.last_name}</p>
              </div>
              <button type="button" onClick={() => setShowAssignModal(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors">✕</button>
            </div>
            <div className="p-6 flex flex-col gap-5">
              {/* Test type */}
              <div className="flex flex-col gap-2">
                <span className="text-sm font-bold uppercase tracking-widest text-zinc-500">Test Type</span>
                <div className="flex gap-2">
                  {(["mock", "practice"] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setAssignForm(f => ({ ...f, test_type: t }))}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${assignForm.test_type === t ? "bg-amber-500 text-zinc-950 border-amber-500" : "bg-zinc-50 text-zinc-500 border-zinc-200 hover:border-zinc-300"}`}
                    >
                      {t === "mock" ? "Mock Test (114 Qs)" : "Practice"}
                    </button>
                  ))}
                </div>
              </div>

              {assignForm.test_type === "practice" && (
                <>
                  {/* # of Questions */}
                  <AdminInput
                    label="# of Questions"
                    value={assignForm.num_questions}
                    onChange={v => setAssignForm(f => ({ ...f, num_questions: v }))}
                    placeholder="20"
                  />

                  {/* Topics */}
                  {Object.keys(assignTopics).length > 0 && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold uppercase tracking-widest text-zinc-500">Topics <span className="text-zinc-300 font-normal normal-case tracking-normal">(optional)</span></span>
                        <div className="flex gap-2 text-xs text-zinc-400">
                          <button type="button" onClick={() => setAssignForm(f => ({ ...f, categories: Object.values(assignTopics).flat() }))} className="px-2.5 py-1 rounded-md bg-zinc-100 hover:bg-blue-50 hover:text-blue-600 transition-colors">Select All</button>
                          <button type="button" onClick={() => setAssignForm(f => ({ ...f, categories: [] }))} className="px-2.5 py-1 rounded-md bg-zinc-100 hover:bg-zinc-200 transition-colors">Clear</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-5">
                        {Object.entries(assignTopics).map(([subject, topics]) => {
                          const isEng = subject.toLowerCase().includes("english");
                          const headerCls = isEng
                            ? "text-blue-700 bg-blue-50 border-blue-200"
                            : "text-violet-700 bg-violet-50 border-violet-200";
                          const selectedCount = topics.filter(t => assignForm.categories.includes(t)).length;
                          return (
                            <div key={subject} className="border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
                              <div className={`flex items-center justify-between px-4 py-3 border-b ${headerCls}`}>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold capitalize">{subject}</span>
                                  {selectedCount > 0 && (
                                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${isEng ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"}`}>
                                      {selectedCount}
                                    </span>
                                  )}
                                </div>
                                <div className="flex gap-2 text-xs">
                                  <button type="button" onClick={() => setAssignForm(f => ({ ...f, categories: [...new Set([...f.categories, ...topics])] }))} className="font-medium opacity-70 hover:opacity-100 transition-opacity">All</button>
                                  <span className="opacity-30">·</span>
                                  <button type="button" onClick={() => setAssignForm(f => ({ ...f, categories: f.categories.filter(c => !topics.includes(c)) }))} className="font-medium opacity-70 hover:opacity-100 transition-opacity">None</button>
                                </div>
                              </div>
                              <div className="overflow-y-auto max-h-72 divide-y divide-zinc-50">
                                {topics.map(topic => {
                                  const checked = assignForm.categories.includes(topic);
                                  return (
                                    <label key={topic} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${checked ? isEng ? "bg-blue-50/60" : "bg-violet-50/60" : "hover:bg-zinc-50"}`}>
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => setAssignForm(f => ({ ...f, categories: checked ? f.categories.filter(c => c !== topic) : [...f.categories, topic] }))}
                                        className={isEng ? "accent-blue-600 w-4 h-4" : "accent-violet-600 w-4 h-4"}
                                      />
                                      <span className="text-sm text-zinc-700">{topic.replace(/_/g, " ")}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Difficulty */}
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-bold uppercase tracking-widest text-zinc-500">Difficulty <span className="text-zinc-300 font-normal normal-case tracking-normal">(optional)</span></span>
                    <div className="flex gap-2">
                      {DIFFICULTIES.map(d => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setAssignForm(f => ({ ...f, difficulties: f.difficulties.includes(d) ? f.difficulties.filter(x => x !== d) : [...f.difficulties, d] }))}
                          className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${assignForm.difficulties.includes(d) ? d === "Easy" ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" : d === "Medium" ? "bg-amber-500/15 text-amber-700 border-amber-500/30" : "bg-red-500/15 text-red-600 border-red-500/30" : "bg-zinc-50 text-zinc-400 border-zinc-200 hover:border-zinc-300"}`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Due date */}
              <div className="flex flex-col gap-2">
                <span className="text-sm font-bold uppercase tracking-widest text-zinc-500">Due Date <span className="text-zinc-300 font-normal normal-case tracking-normal">(optional)</span></span>
                <div className="flex gap-2">
                  <input
                    type="date"
                    title="Due date"
                    value={assignForm.due_date}
                    onChange={e => setAssignForm(f => ({ ...f, due_date: e.target.value }))}
                    className="flex-1 bg-white border border-zinc-300 rounded-lg px-3 py-2 text-base text-zinc-900 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/25 transition-colors"
                  />
                  {assignForm.due_date && (
                    <input
                      type="time"
                      title="Due time"
                      value={assignForm.due_time}
                      onChange={e => setAssignForm(f => ({ ...f, due_time: e.target.value }))}
                      className="w-32 bg-white border border-zinc-300 rounded-lg px-3 py-2 text-base text-zinc-900 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/25 transition-colors"
                    />
                  )}
                </div>
                {assignForm.due_date && (
                  <p className="text-xs text-zinc-400">Time defaults to 11:59 PM if not changed.</p>
                )}
              </div>

              {/* Time limit */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold uppercase tracking-widest text-zinc-500">Time Limit <span className="text-zinc-300 font-normal normal-case tracking-normal">(optional)</span></span>
                  <button
                    type="button"
                    aria-label="Toggle time limit"
                    aria-pressed={assignForm.timed ? "true" : "false"}
                    onClick={() => setAssignForm(f => ({ ...f, timed: !f.timed }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${assignForm.timed ? "bg-amber-500" : "bg-zinc-200"}`}
                  >
                    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${assignForm.timed ? "translate-x-5.5" : "translate-x-0.5"}`} />
                  </button>
                </div>
                {assignForm.timed && (
                  <div className="flex gap-3">
                    <AdminInput label="Hours" value={assignForm.dur_h} onChange={v => setAssignForm(f => ({ ...f, dur_h: v }))} placeholder="0" />
                    <AdminInput label="Minutes" value={assignForm.dur_m} onChange={v => setAssignForm(f => ({ ...f, dur_m: v }))} placeholder="0" />
                  </div>
                )}
              </div>

              {/* Note */}
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-bold uppercase tracking-widest text-zinc-500">Note for Student <span className="text-zinc-300 font-normal normal-case tracking-normal">(optional)</span></span>
                <textarea
                  value={assignForm.note}
                  onChange={e => setAssignForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="e.g. Focus on word problems…"
                  rows={2}
                  className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-base text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/25 resize-none transition-colors"
                />
              </label>

              {assignWarning && (
                <p className="text-sm text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">⚠ {assignWarning}</p>
              )}
              {assignError && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{assignError}</p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-zinc-200 flex items-center justify-between shrink-0">
              <button type="button" onClick={() => setShowAssignModal(false)} className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors">Cancel</button>
              <button type="button" onClick={saveAssignment} disabled={assignSaving} className="px-5 py-2 rounded-lg text-sm font-bold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-colors disabled:opacity-50">
                {assignSaving ? "Assigning…" : "Assign"}
              </button>
            </div>
          </div>
        </div>
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
                  <option value="tutor">Tutor</option>
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
