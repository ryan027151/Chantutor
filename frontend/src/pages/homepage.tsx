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
      .eq("user_id", user!.id);

    if (error) {
      console.error("Tests fetch failed:", error);
      return;
    }

    if (data) {
      const userTests: Test[] = data.map((test) => ({
        id: test.id,
        user_id: test.user_id,
        test_name: test.test_name,
        created_at: test.created_at,
        duration: test.duration,
        score: test.score,
        total_questions: test.total_questions,
        configuration: test.configuration,
      }));
      setRecentTests(userTests);
    }
  }

  async function checkDiagnosticTest() {
    const { data: diagnosticTests, error } = await supabase
      .from("tests")
      .select("*")
      .eq("user_id", user!.id)
      .eq("test_name", "Diagnostic Test")
      .limit(1);

    if (error) {
      console.error("Diagnostic check failed:", error);
      return;
    }

    if (!diagnosticTests || diagnosticTests.length === 0) {
      setShowDiagnosticPrompt(true);
    } else {
      const diag = diagnosticTests[0];
      if (diag.score === null) {
        // Incomplete diagnostic — student must finish it before accessing home
        navigate(`/mock/${diag.id}`);
      }
      // score is set means diagnostic is complete; stay on home page
    }
  }

  async function createDiagnosticTest() {
    const { data: countData, error: countError } = await supabase.rpc(
      "count_diagnostic_questions"
    );

    if (countError || countData === null) {
      console.error("Failed to count diagnostic questions:", countError);
      return;
    }

    const { data, error } = await supabase
      .from("tests")
      .insert([
        {
          user_id: user!.id,
          test_name: "Diagnostic Test",
          score: null,
          duration: 180,
          total_questions: countData,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Failed to create diagnostic test:", error);
      return;
    }

    navigate(`/mock/${data.id}`);
  }

  async function startMockTest() {
    const totalMinutes = isTimed ? durationHours * 60 + durationMinutes : 0;

    const { data, error } = await supabase
      .from("tests")
      .insert([
        {
          user_id: user!.id,
          score: null,
          duration: totalMinutes,
          total_questions: numQuestions,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Insert failed:", error.message);
      return;
    }

    navigate(`/mock/${data.id}`);
  }

  useEffect(() => {
    if (!user) return;
    if (user.role === "student") {
      checkDiagnosticTest();
    }
    getTests();
  }, [user]);

  return (
    <div className="flex h-screen bg-gray-200">

      {/* Diagnostic test required overlay */}
      {showDiagnosticPrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4 flex flex-col gap-4">
            <h2 className="text-2xl font-bold">Diagnostic Test Required</h2>
            <p className="text-gray-700">
              Before accessing Mock Tests, Practice, and Analysis, you must complete the <strong>Diagnostic Test</strong>.
            </p>
            <ul className="list-disc list-inside text-gray-700 text-sm space-y-1">
              <li>114 questions — English section first, then Math</li>
              <li>Fixed 3-hour time limit</li>
              <li>Once started, you cannot leave the test</li>
              <li>All other features unlock after completion</li>
            </ul>
            <button
              type="button"
              className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-lg font-semibold"
              onClick={createDiagnosticTest}
            >
              Start Diagnostic Test
            </button>
          </div>
        </div>
      )}

      <MockTextPopUp appear={mockTestPopUp} setAppear={setMockTestPopUp}>
        <h3 className="md:text-xl text-sm">Enter in test settings:</h3>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isTimed}
              onChange={(e) => setIsTimed(e.target.checked)}
            />
            Timed
          </label>
          {isTimed && (
            <div className="flex gap-4">
              <label>
                Hours:
                <input
                  type="number"
                  min="0"
                  max="9"
                  className="border mx-2 w-16"
                  value={durationHours}
                  onChange={(e) =>
                    setDurationHours(Math.max(0, parseInt(e.target.value) || 0))
                  }
                />
              </label>
              <label>
                Minutes:
                <input
                  type="number"
                  min="0"
                  max="59"
                  className="border mx-2 w-16"
                  value={durationMinutes}
                  onChange={(e) =>
                    setDurationMinutes(
                      Math.max(0, Math.min(59, parseInt(e.target.value) || 0))
                    )
                  }
                />
              </label>
            </div>
          )}
        </div>
        <span>
          <label htmlFor="test-mode">Mode:</label>
          <select
            id="test-mode"
            defaultValue="mock"
            onChange={(e) => {
              if (e.target.value === "mock") {
                setNumQuestions(117);
                setNumPracticeQuestions(false);
              } else {
                setNumPracticeQuestions(true);
                setNumQuestions(0);
              }
            }}
          >
            <option value="mock">Mock Test</option>
            <option value="practice">Practice</option>
          </select>
        </span>
        {numPracticeQuestions && (
          <label>
            # of Questions:
            <input
              type="number"
              className="border mx-2"
              required
              onChange={(e) => setNumQuestions(parseInt(e.target.value))}
            />
          </label>
        )}
        <button
          type="button"
          className="w-full bg-blue-200 hover:bg-blue-400 p-3 hover:text-white"
          onClick={startMockTest}
        >
          Begin
        </button>
      </MockTextPopUp>

      <SideBar className="border-r border-gray-300 p-4" />

      <div className="flex flex-col md:px-16 px-8 md:py-12 py-5 gap-8 w-full">
        {/* Header */}
        <div className="flex justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="md:text-5xl text-2xl font-bold">Welcome</h1>
            <h3 className="md:text-xl text-sm">
              {user ? user.first_name : ""}
            </h3>
          </div>
          <button
            type="button"
            className="h-auto rounded-lg bg-blue-500 px-2 text-white text-base"
            onClick={() => setMockTestPopUp(true)}
          >
            Take New Test
          </button>
        </div>

        {/* Recent Tests */}
        <h2 className="md:text-2xl text-xl">Recent Tests</h2>
        <div className="overflow-y-auto">
          <TestTable tests={recentTests} />
        </div>
      </div>
    </div>
  );
}

export default HomePage;
