import SideBar from "../components/sideBar";
import TestTable from "../components/testTable";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase-client";
import MockTextPopUp from "../components/mockTestPopUp";
import { useContext, useEffect, useState } from "react";
import { UserContext } from "../components/userContext";
import { Test } from "../components/types";

interface AssignmentWithTest {
  id: string;
  test_type: "mock" | "practice";
  num_questions: number | null;
  difficulties: string[] | null;
  categories: string[] | null;
  due_date: string | null;
  duration_minutes: number | null;
  note: string | null;
  status: string;
  test_id: string | null;
  created_at: string;
  tests: { score: number | null } | null;
}

function HomePage() {
  const navigate = useNavigate();
  const [mockTestPopUp, setMockTestPopUp] = useState(false);
  const [recentTests, setRecentTests] = useState<Test[] | null>(null);
  const [isTimed, setIsTimed] = useState(false);
  const [durationHours, setDurationHours] = useState("0");
  const [durationMinutes, setDurationMinutes] = useState("0");
  const user = useContext(UserContext);
  const [numQuestions, setNumQuestions] = useState("114");
  const [startError, setStartError] = useState("");
  const [numPracticeQuestions, setNumPracticeQuestions] = useState(false);
  const [showDiagnosticPrompt, setShowDiagnosticPrompt] = useState(false);
  const [availableTopics, setAvailableTopics] = useState<string[]>([]);
  const [topicsBySubject, setTopicsBySubject] = useState<Record<string, string[]>>({});
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<"all" | "mock" | "practice">("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [resetIds, setResetIds] = useState<Set<string>>(new Set());
  const [assignments, setAssignments] = useState<AssignmentWithTest[]>([]);

  async function getTests() {
    const { data, error } = await supabase
      .from("tests")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });
    if (error) { console.error("Tests fetch failed:", error); return; }
    if (data) {
      setRecentTests(
        data.map((test) => ({
          id: test.id,
          user_id: test.user_id,
          test_name: test.test_name,
          created_at: test.created_at,
          duration: test.duration,
          score: test.score,
          total_questions: test.total_questions,
          configuration: test.configuration,
        }))
      );
    }
  }

  async function checkDiagnosticTest() {
    const { data: diagnosticTests, error } = await supabase
      .from("tests")
      .select("*")
      .eq("user_id", user!.id)
      .eq("test_name", "Diagnostic Test")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) { console.error("Diagnostic check failed:", error); return; }
    if (!diagnosticTests || diagnosticTests.length === 0) {
      setShowDiagnosticPrompt(true);
    } else {
      const diag = diagnosticTests[0];
      if (diag.score === null) navigate(`/mock/${diag.id}`);
    }
  }

  async function createDiagnosticTest() {
    const { data: countData, error: countError } = await supabase.rpc("count_diagnostic_questions");
    if (countError || countData === null) { console.error("Failed to count diagnostic questions:", countError); return; }
    const { data, error } = await supabase
      .from("tests")
      .insert([{ user_id: user!.id, test_name: "Diagnostic Test", score: null, duration: 180, total_questions: countData }])
      .select()
      .single();
    if (error) { console.error("Failed to create diagnostic test:", error); return; }
    navigate(`/mock/${data.id}`);
  }

  async function startMockTest() {
    setStartError("");
    if (numPracticeQuestions) {
      const n = parseInt(numQuestions, 10);
      if (!numQuestions.trim() || isNaN(n) || n < 1 || !Number.isInteger(n)) {
        setStartError("# of questions must be a whole number greater than 0.");
        return;
      }
    }
    if (isTimed) {
      const h = parseInt(durationHours, 10) || 0;
      const m = parseInt(durationMinutes, 10) || 0;
      if (h === 0 && m === 0) {
        setStartError("Duration must be greater than 0 minutes.");
        return;
      }
    }
    const parsedQ = numPracticeQuestions ? parseInt(numQuestions, 10) : 114;
    const totalMinutes = isTimed ? (parseInt(durationHours, 10) || 0) * 60 + (parseInt(durationMinutes, 10) || 0) : 0;
    const testName = numPracticeQuestions ? "Practice" : "Mock Test";
    const configuration = numPracticeQuestions && selectedTopics.length > 0
      ? { practice_topics: selectedTopics }
      : null;
    const { data, error } = await supabase
      .from("tests")
      .insert([{ user_id: user!.id, test_name: testName, score: null, duration: totalMinutes, total_questions: parsedQ, configuration }])
      .select()
      .single();
    if (error) { console.error("Insert failed:", error.message); return; }
    navigate(`/mock/${data.id}`);
  }

  async function resetTest(testId: string) {
    if (!user) return;
    await supabase.from("questions").delete().eq("test_id", testId).eq("user_id", user.id);
    localStorage.removeItem(`timerRemaining_${testId}`);
    setResetIds(prev => new Set(prev).add(testId));
    getTests();
  }

  async function getAssignments() {
    if (!user) return;
    const { data } = await supabase
      .from("assignments")
      .select("*, tests(score)")
      .eq("student_id", user.id)
      .order("created_at", { ascending: false });
    setAssignments((data as AssignmentWithTest[]) ?? []);
  }

  async function startAssignment(a: AssignmentWithTest) {
    if (a.test_id) {
      if (a.test_type === "practice" && a.categories && a.categories.length > 0) {
        await supabase
          .from("tests")
          .update({ configuration: { assignment_id: a.id, practice_topics: a.categories } })
          .eq("id", a.test_id);
      }
      navigate(`/mock/${a.test_id}`);
      return;
    }
    const testName = a.test_type === "mock" ? "Mock Test" : "Practice";
    const totalQ = a.num_questions ?? 114;
    const totalMin = a.duration_minutes ?? 0;
    const config: Record<string, unknown> = { assignment_id: a.id };
    if (a.test_type === "practice" && a.categories && a.categories.length > 0) {
      config.practice_topics = a.categories;
    }
    const { data: testData, error } = await supabase
      .from("tests")
      .insert({ user_id: user!.id, test_name: testName, score: null, duration: totalMin, total_questions: totalQ, configuration: config })
      .select().single();
    if (error || !testData) return;
    await supabase.from("assignments").update({ test_id: testData.id }).eq("id", a.id);
    navigate(`/mock/${testData.id}`);
  }

  async function loadTopics() {
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
    setTopicsBySubject(result);
    setAvailableTopics(Object.values(result).flat());
  }

  useEffect(() => {
    if (!user) return;
    if (user.role === "student") checkDiagnosticTest();
    getTests();
    getAssignments();
    loadTopics();
  }, [user]);

  useEffect(() => {
    if (!numPracticeQuestions) setSelectedTopics([]);
  }, [numPracticeQuestions]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const completedTests = recentTests?.filter((t) => t.score !== null) ?? [];
  const diagTest = recentTests?.find((t) => t.test_name === "Diagnostic Test" && t.score !== null);
  const lastTest = recentTests?.[0];

  const filteredTests = recentTests
    ? recentTests
        .filter((t) => {
          if (filterType === "mock") return t.test_name === "Mock Test" || t.test_name === "Diagnostic Test";
          if (filterType === "practice") return t.test_name === "Practice";
          return true;
        })
        .slice()
        .sort((a, b) => {
          const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          return sortOrder === "newest" ? -diff : diff;
        })
    : null;

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Diagnostic overlay */}
      {showDiagnosticPrompt && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full flex flex-col gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Diagnostic Test Required</h2>
              <p className="text-slate-600 mt-1 text-sm">
                Complete the Diagnostic Test before accessing other features.
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {[
                "114 questions — English first, then Math",
                "Fixed 3-hour time limit",
                "Cannot leave the test once started",
                "All features unlock after completion",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-slate-700">
                  <span className="mt-0.5 text-blue-500">›</span>
                  {item}
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Important Rules</p>
              <ul className="flex flex-col gap-2">
                {[
                  "You are not allowed to skip questions.",
                  "If a question has an issue, use the Flag button (bottom-right) to report it, then fill in any answer to move on.",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-amber-800">
                    <span className="mt-0.5 shrink-0">⚠</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold transition-colors"
              onClick={createDiagnosticTest}
            >
              Start Diagnostic Test
            </button>
          </div>
        </div>
      )}

      {/* New test modal */}
      <MockTextPopUp appear={mockTestPopUp} setAppear={setMockTestPopUp}>
        <div>
          <h3 className="text-2xl font-bold text-slate-900">New Test</h3>
          <p className="text-base text-slate-500 mt-1">Configure your test settings below.</p>
        </div>

        <div className="flex flex-col gap-5">
          {/* Mode */}
          <div className="flex flex-col gap-2">
            <label htmlFor="test-mode" className="text-base font-medium text-slate-700">Mode</label>
            <select
              id="test-mode"
              title="Test mode"
              value={numPracticeQuestions ? "practice" : "mock"}
              className="border border-slate-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              onChange={(e) => {
                if (e.target.value === "mock") { setNumQuestions("114"); setNumPracticeQuestions(false); setStartError(""); }
                else { setNumPracticeQuestions(true); setNumQuestions("20"); setStartError(""); }
              }}
            >
              <option value="mock">Mock Test (114 questions)</option>
              <option value="practice">Practice</option>
            </select>
          </div>

          {/* Custom question count */}
          {numPracticeQuestions && (
            <div className="flex flex-col gap-2">
              <label htmlFor="practice-q-count" className="text-base font-medium text-slate-700"># of Questions</label>
              <input
                id="practice-q-count"
                type="text"
                inputMode="numeric"
                value={numQuestions}
                onFocus={(e) => e.target.select()}
                className="border border-slate-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                onChange={(e) => setNumQuestions(e.target.value)}
              />
            </div>
          )}

          {/* Topic filter — practice mode only */}
          {numPracticeQuestions && Object.keys(topicsBySubject).length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-base font-medium text-slate-700">Topics</span>
                <div className="flex gap-2 text-sm text-slate-400">
                  <button type="button" onClick={() => setSelectedTopics(availableTopics)} className="hover:text-blue-600 transition-colors">All</button>
                  <span>·</span>
                  <button type="button" onClick={() => setSelectedTopics([])} className="hover:text-blue-600 transition-colors">None</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(topicsBySubject).map(([subject, topics]) => {
                  const isEnglish = subject.toLowerCase().includes("english");
                  const headerColor = isEnglish ? "text-blue-700 bg-blue-50 border-blue-200" : "text-violet-700 bg-violet-50 border-violet-200";
                  const accentClass = isEnglish ? "accent-blue-600" : "accent-violet-600";
                  const subjectTopicsSelected = topics.filter(t => selectedTopics.includes(t)).length;
                  return (
                    <div key={subject} className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className={`flex items-center justify-between px-3 py-2 border-b text-sm font-semibold ${headerColor}`}>
                        <span>{subject}</span>
                        <div className="flex gap-1.5">
                          <button type="button" onClick={() => setSelectedTopics(prev => [...new Set([...prev, ...topics])])} className="opacity-60 hover:opacity-100 transition-opacity">All</button>
                          <span className="opacity-40">·</span>
                          <button type="button" onClick={() => setSelectedTopics(prev => prev.filter(t => !topics.includes(t)))} className="opacity-60 hover:opacity-100 transition-opacity">None</button>
                        </div>
                      </div>
                      <div className="overflow-y-auto max-h-52 divide-y divide-slate-50">
                        {topics.map(topic => (
                          <label key={topic} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-50">
                            <input
                              type="checkbox"
                              checked={selectedTopics.includes(topic)}
                              onChange={() => setSelectedTopics(prev =>
                                prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
                              )}
                              className={accentClass}
                            />
                            <span className="text-sm text-slate-700 leading-snug">{topic}</span>
                          </label>
                        ))}
                      </div>
                      <div className={`px-3 py-1.5 text-sm border-t ${isEnglish ? "text-blue-500 border-blue-100" : "text-violet-500 border-violet-100"}`}>
                        {subjectTopicsSelected === 0 ? "All included" : `${subjectTopicsSelected} selected`}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-sm text-slate-400">
                {selectedTopics.length === 0 ? "All topics included" : `${selectedTopics.length} topic${selectedTopics.length > 1 ? "s" : ""} selected`}
              </p>
            </div>
          )}

          {/* Timed toggle */}
          <div className="flex items-center justify-between">
            <span className="text-base font-medium text-slate-700">Timed</span>
            <button
              type="button"
              aria-label="Toggle timed mode"
              aria-pressed={isTimed}
              onClick={() => { setIsTimed(t => !t); setStartError(""); }}
              className={`relative inline-flex h-7 w-13 items-center rounded-full transition-colors focus:outline-none ${isTimed ? "bg-blue-600" : "bg-slate-200"}`}
            >
              <span
                className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${isTimed ? "translate-x-6.5" : "translate-x-0.5"}`}
              />
            </button>
          </div>

          {/* Duration */}
          {isTimed && (
            <div className="flex gap-4">
              <div className="flex flex-col gap-2 flex-1">
                <label htmlFor="duration-hours" className="text-base font-medium text-slate-700">Hours</label>
                <input
                  id="duration-hours"
                  type="text"
                  inputMode="numeric"
                  value={durationHours}
                  title="Hours"
                  placeholder="0"
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setDurationHours(e.target.value)}
                  className="border border-slate-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex flex-col gap-2 flex-1">
                <label htmlFor="duration-minutes" className="text-base font-medium text-slate-700">Minutes</label>
                <input
                  id="duration-minutes"
                  type="text"
                  inputMode="numeric"
                  value={durationMinutes}
                  title="Minutes"
                  placeholder="0"
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  className="border border-slate-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {startError && (
          <p className="text-base text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">
            {startError}
          </p>
        )}
        <button
          type="button"
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl font-semibold text-base transition-colors"
          onClick={startMockTest}
        >
          Start Test
        </button>
      </MockTextPopUp>

      <SideBar />

      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top bar */}
        <div className="bg-white border-b border-slate-100 px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-between shrink-0 shadow-sm gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-xl font-bold text-slate-900 truncate">
              {greeting}, {user?.first_name}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 hidden sm:block">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
          <button
            type="button"
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg font-medium text-xs sm:text-sm transition-colors shrink-0"
            onClick={() => { setStartError(""); setNumPracticeQuestions(false); setNumQuestions("114"); setSelectedTopics([]); setMockTestPopUp(true); }}
          >
            + New Test/Practice
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-4 sm:py-6 flex flex-col gap-5 sm:gap-6">
          {/* Stats row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Tests Taken</p>
              <p className="text-3xl font-bold text-slate-900">{recentTests?.length ?? "—"}</p>
            </div>
            <button
              type="button"
              onClick={() => diagTest && navigate(`/results/${diagTest.id}`)}
              className={`bg-white rounded-xl border border-slate-100 shadow-sm p-5 text-left transition-shadow ${diagTest ? "hover:shadow-md cursor-pointer" : "cursor-default"}`}
            >
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Diagnostic</p>
              {diagTest ? (
                <div className="flex items-end gap-1">
                  <p className="text-3xl font-bold text-emerald-600">{diagTest.score}%</p>
                  <p className="text-xs text-slate-400 mb-1 ml-0.5">View →</p>
                </div>
              ) : (
                <p className="text-sm font-medium text-amber-500 mt-2">Pending</p>
              )}
            </button>
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Completed</p>
              <p className="text-3xl font-bold text-slate-900">{completedTests.length}</p>
            </div>
          </div>

          {/* Assigned Work */}
          {(() => {
            const activeAssignments = assignments.filter(a => {
              const s = a.tests?.score;
              return s === null || s === undefined;
            });
            const completedAssignments = assignments.filter(a => {
              const s = a.tests?.score;
              return s !== null && s !== undefined;
            });
            return (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">Assigned Work</h2>
                  {activeAssignments.length > 0 && (
                    <span className="text-xs font-bold bg-rose-500 text-white rounded-full px-1.5 py-0.5 leading-none">
                      {activeAssignments.length}
                    </span>
                  )}
                </div>

                {assignments.length === 0 ? (
                  <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-5 py-8 text-center text-slate-400 text-sm">
                    No assignments yet. Your teacher will assign work here.
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {/* Active / In-Progress assignments */}
                    {activeAssignments.length > 0 && (
                      <div className="flex flex-col gap-2.5">
                        {activeAssignments.map(a => {
                          const isInProgress = !!a.test_id;
                          const isOverdue = !isInProgress && a.due_date && new Date(a.due_date) < new Date();
                          const dueSoon = !isOverdue && !isInProgress && a.due_date && new Date(a.due_date).getTime() - Date.now() < 86400000;
                          const dueLabel = (() => {
                            if (!a.due_date) return null;
                            const d = new Date(a.due_date);
                            const diffMs = d.getTime() - Date.now();
                            const diffDays = Math.ceil(diffMs / 86400000);
                            if (diffMs < 0) return `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? "s" : ""}`;
                            if (diffDays === 0) return "Due today";
                            if (diffDays === 1) return "Due tomorrow";
                            return `Due in ${diffDays} days`;
                          })();
                          return (
                            <div key={a.id} className={`bg-white rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3 shadow-sm ${isOverdue ? "border-rose-200" : dueSoon ? "border-amber-200" : "border-slate-100"}`}>
                              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${a.test_type === "mock" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
                                    {a.test_type === "mock" ? "Mock Test" : "Practice"}
                                  </span>
                                  {isInProgress && (
                                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">In Progress</span>
                                  )}
                                  {dueLabel && (
                                    <span className={`text-xs font-medium ${isOverdue ? "text-rose-500" : dueSoon ? "text-amber-500" : "text-slate-400"}`}>
                                      {dueLabel}
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-slate-600">
                                  <span>{a.test_type === "mock" ? "114 questions" : `${a.num_questions ?? "?"} questions`}</span>
                                  {a.duration_minutes ? (
                                    <span className="text-slate-400">· {Math.floor(a.duration_minutes / 60) > 0 ? `${Math.floor(a.duration_minutes / 60)}h ` : ""}{a.duration_minutes % 60 > 0 ? `${a.duration_minutes % 60}m` : ""} limit</span>
                                  ) : null}
                                  {a.difficulties && a.difficulties.length > 0 && (
                                    <span className="text-slate-400">· {a.difficulties.join(", ")}</span>
                                  )}
                                </div>
                                {a.categories && a.categories.length > 0 && (
                                  <p className="text-xs text-slate-400 truncate">Topics: {a.categories.join(", ")}</p>
                                )}
                                {a.note && (
                                  <p className="text-xs text-slate-500 italic">"{a.note}"</p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => startAssignment(a)}
                                className={`shrink-0 px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${isInProgress ? "bg-amber-500 hover:bg-amber-400 text-zinc-950" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
                              >
                                {isInProgress ? "Continue" : "Start"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Completed assignments subsection */}
                    {completedAssignments.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          Completed
                        </p>
                        <div className="flex flex-col gap-2">
                          {completedAssignments.map(a => (
                            <div key={a.id} className="bg-white rounded-xl border border-emerald-100 p-4 flex flex-col sm:flex-row sm:items-center gap-3 shadow-sm opacity-85">
                              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${a.test_type === "mock" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
                                    {a.test_type === "mock" ? "Mock Test" : "Practice"}
                                  </span>
                                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    Completed
                                  </span>
                                  <span className="text-xs font-bold text-emerald-600">
                                    {a.tests?.score}%
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-slate-500">
                                  <span>{a.test_type === "mock" ? "114 questions" : `${a.num_questions ?? "?"} questions`}</span>
                                  {a.difficulties && a.difficulties.length > 0 && (
                                    <span className="text-slate-400">· {a.difficulties.join(", ")}</span>
                                  )}
                                </div>
                                {a.categories && a.categories.length > 0 && (
                                  <p className="text-xs text-slate-400 truncate">Topics: {a.categories.join(", ")}</p>
                                )}
                                {a.note && (
                                  <p className="text-xs text-slate-400 italic">"{a.note}"</p>
                                )}
                              </div>
                              {a.test_id && (
                                <button
                                  type="button"
                                  onClick={() => navigate(`/results/${a.test_id}`)}
                                  className="shrink-0 px-5 py-2 rounded-lg text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                                >
                                  View Results
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Recent tests */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-y-2">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Recent Tests</h2>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {/* Type filter */}
                <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium shrink-0">
                  {(["all", "mock", "practice"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilterType(f)}
                      className={`px-2.5 py-1.5 transition-colors capitalize ${
                        filterType === f
                          ? "bg-blue-600 text-white"
                          : "bg-white text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      {f === "all" ? "All" : f === "mock" ? <><span className="sm:hidden">Mock</span><span className="hidden sm:inline">Mock / Diagnostic</span></> : "Practice"}
                    </button>
                  ))}
                </div>
                {/* Date sort */}
                <select
                  title="Sort order"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </div>
            </div>
            <TestTable tests={filteredTests} onReset={resetTest} resetIds={resetIds} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomePage;
