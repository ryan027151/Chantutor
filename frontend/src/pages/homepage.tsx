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
  const [duration, setDuration] = useState(0);
  const user = useContext(UserContext);
  //Default value of 114 b/c drop down option starts on Mock test
  const [numQuestions, setNumQuestions] = useState(114);
  const [numPracticeQuestions, setNumPracticeQuestions] = useState(false);

  async function getTests() {
    const { data, error } = await supabase
      .from("tests")
      .select("*")
      .eq("user_id", user.id);

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

  async function MockTest() {
    const { data, error } = await supabase
      .from("tests")
      .insert([
        {
          user_id: user.id,
          score: null,
          duration: Math.floor(duration),
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
    getTests();
  }, [user]);

  return (
    <div className="flex h-screen bg-gray-200">
      
      <MockTextPopUp appear={mockTestPopUp} setAppear={setMockTestPopUp}>
        <h3 className="md:text-xl text-sm">Enter in test settings:</h3>
        <form className="flex flex-col gap-1">
          <label>
            Time:
            <input
              type="number"
              className="border mx-2"
              required
              onChange={(e) => setDuration(parseInt(e.target.value))}
            />
          </label>
        </form>
        <span>
            <label>Mode:</label>
            <select
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
          className="w-full bg-blue-200 hover:bg-blue-400 p-3 hover:text-white"
          onClick={MockTest}
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
              {user ? `${user.first_name}` : ""}
            </h3>
          </div>
          <button
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