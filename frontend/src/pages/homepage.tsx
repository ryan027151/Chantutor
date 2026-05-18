import SideBar from "../components/sideBar";
import TestTable from "../components/testTable";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase-client";
import MockTextPopUp from "../components/mockTestPopUp";
import { useContext, useEffect, useState } from "react";
import { UserContext } from "../components/userContext";
import { Test } from "../components/types";

function HomePage() {
  const navigate = useNavigate();
  const [mockTestPopUp, setMockTestPopUp] = useState(false);
  const [recentTests, setRecentTests] = useState<Test[] | null>(null);
  const [isTimed, setIsTimed] = useState(false);
  const [durationHours, setDurationHours] = useState(0);
  const [durationMinutes, setDurationMinutes] = useState(0);
  const user = useContext(UserContext);
  const [numQuestions, setNumQuestions] = useState(117);
  const [numPracticeQuestions, setNumPracticeQuestions] = useState(false);
  const [showDiagnosticPrompt, setShowDiagnosticPrompt] = useState(false);

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
    const totalMinutes = isTimed ? durationHours * 60 + durationMinutes : 0;
    const { data, error } = await supabase
      .from("tests")
      .insert([{ user_id: user!.id, score: null, duration: totalMinutes, total_questions: numQuestions }])
      .select()
      .single();
    if (error) { console.error("Insert failed:", error.message); return; }
    navigate(`/mock/${data.id}`);
  }

  useEffect(() => {
    if (!user) return;
    if (user.role === "student") checkDiagnosticTest();
    getTests();
  }, [user]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const completedTests = recentTests?.filter((t) => t.score !== null) ?? [];
  const diagTest = recentTests?.find((t) => t.test_name === "Diagnostic Test" && t.score !== null);
  const lastTest = recentTests?.[0];

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
          <h3 className="text-lg font-bold text-slate-900">New Test</h3>
          <p className="text-sm text-slate-500 mt-0.5">Configure your test settings below.</p>
        </div>

        <div className="flex flex-col gap-4">
          {/* Mode */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="test-mode" className="text-sm font-medium text-slate-700">Mode</label>
            <select
              id="test-mode"
              title="Test mode"
              defaultValue="mock"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              onChange={(e) => {
                if (e.target.value === "mock") { setNumQuestions(117); setNumPracticeQuestions(false); }
                else { setNumPracticeQuestions(true); setNumQuestions(0); }
              }}
            >
              <option value="mock">Mock Test (117 questions)</option>
              <option value="practice">Practice</option>
            </select>
          </div>

          {/* Custom question count */}
          {numPracticeQuestions && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700"># of Questions</label>
              <input
                type="number"
                min="1"
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                onChange={(e) => setNumQuestions(parseInt(e.target.value))}
              />
            </div>
          )}

          {/* Timed toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Timed</span>
            <button
              type="button"
              aria-label="Toggle timed mode"
              aria-pressed={isTimed ? "true" : "false"}
              onClick={() => setIsTimed(!isTimed)}
              className={`relative w-10 h-6 rounded-full transition-colors ${isTimed ? "bg-blue-600" : "bg-slate-200"}`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isTimed ? "translate-x-4" : "translate-x-0.5"}`}
              />
            </button>
          </div>

          {/* Duration */}
          {isTimed && (
            <div className="flex gap-3">
              <div className="flex flex-col gap-1.5 flex-1">
                <label htmlFor="duration-hours" className="text-sm font-medium text-slate-700">Hours</label>
                <input
                  id="duration-hours"
                  type="number" min="0" max="9"
                  value={durationHours}
                  title="Hours"
                  placeholder="0"
                  onChange={(e) => setDurationHours(Math.max(0, parseInt(e.target.value) || 0))}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                <label htmlFor="duration-minutes" className="text-sm font-medium text-slate-700">Minutes</label>
                <input
                  id="duration-minutes"
                  type="number" min="0" max="59"
                  value={durationMinutes}
                  title="Minutes"
                  placeholder="0"
                  onChange={(e) => setDurationMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-semibold transition-colors"
          onClick={() => { setMockTestPopUp(false); startMockTest(); }}
        >
          Start Test
        </button>
      </MockTextPopUp>

      <SideBar />

      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top bar */}
        <div className="bg-white border-b border-slate-100 px-8 py-4 flex items-center justify-between shrink-0 shadow-sm">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {greeting}, {user?.first_name}
            </h1>
            <p className="text-sm text-slate-500">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
          <button
            type="button"
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors"
            onClick={() => setMockTestPopUp(true)}
          >
            + New Test
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-8 py-6 flex flex-col gap-6">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Tests Taken</p>
              <p className="text-3xl font-bold text-slate-900">{recentTests?.length ?? "—"}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Diagnostic</p>
              {diagTest ? (
                <p className="text-3xl font-bold text-emerald-600">{diagTest.score}%</p>
              ) : (
                <p className="text-sm font-medium text-amber-500 mt-2">Pending</p>
              )}
            </div>
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Completed</p>
              <p className="text-3xl font-bold text-slate-900">{completedTests.length}</p>
            </div>
          </div>

          {/* Recent tests */}
          <div>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Recent Tests</h2>
            <TestTable tests={recentTests} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomePage;
