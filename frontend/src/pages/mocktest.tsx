import { supabase } from "../supabase-client";
import { useEffect, useState, useContext, useRef } from "react";
import { icons } from "../assets/icons.tsx";
import { useNavigate } from "react-router-dom";
import QuestionRenderer from "../components/questionRenderer.tsx";
import MediaDisplay from "../components/mediaDisplay.tsx";
import { useParams } from "react-router-dom";
import { UserContext } from "../components/userContext.ts";
import { Test, MediaItem } from "../components/types.ts";
import { parseFormattedText } from "../utils/textParser.tsx";

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Returns true if the media_id covers multiple questions (e.g. "25A_Q1-Q8_A").
// Single-question media looks like "25A_Q25_A" — no hyphen in the question segment.
function isMultiQuestionMedia(mediaId: string): boolean {
  const parts = mediaId.split("_");
  return parts.length >= 2 && parts[1].includes("-");
}

// Returns true if the media_id is a number-line choice image (e.g. "24A_Q113_NLA").
function isChoiceMedia(mediaId: string): boolean {
  const suffix = mediaId.split("_").pop() ?? "";
  return suffix.startsWith("NL");
}

// Extracts the choice letter from a number-line media_id ("24A_Q113_NLA" → "A").
function choiceLetter(mediaId: string): string {
  const suffix = mediaId.split("_").pop() ?? "";
  return suffix.slice(2); // remove "NL"
}

function MockTest() {
  const [questionData, setQuestionData] = useState<Record<string, string> | null>(null);
  // Preserved copy of the active (unanswered) question while the student reviews past questions
  const [activeQuestionData, setActiveQuestionData] = useState<Record<string, string> | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(1);
  // latestQuestion is the next unanswered question index
  const [latestQuestion, setLatestQuestion] = useState(1);
  const [chosenAnswer, setChosenAnswer] = useState("");
  const [previousAnswer, setPreviousAnswer] = useState("");
  const [nullSubmission, setNullSubmission] = useState(false);
  const [currentTest, setCurrentTest] = useState<Test | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasInitialized = useRef(false);

  const navigate = useNavigate();
  const user = useContext(UserContext);
  const { testID } = useParams();

  // Derived values — recalculated every render, no extra state needed
  const isReadOnly = currentQuestion < latestQuestion;

  // Split mediaItems into display media (passage/graph/table/equation)
  // and number-line choice images
  const displayMedia = mediaItems.filter((m) => !isChoiceMedia(m.media_id));
  const choiceImages: Record<string, string> = {};
  mediaItems
    .filter((m) => isChoiceMedia(m.media_id))
    .forEach((m) => { choiceImages[choiceLetter(m.media_id)] = m.content; });

  // Back button is only shown for passage questions that span multiple questions
  const isPassageQuestion = mediaItems.some((m) => isMultiQuestionMedia(m.media_id));

  // ─── Data fetching ──────────────────────────────────────────────────────────

  const getQuestion = async (test: Test | null, questionIndex: number) => {
    if (!test) return;
    if (test.test_name === "Diagnostic") {
      const { data, error } = await supabase.rpc("get_diagnostic_question", {
        p_test_id: testID,
        p_order_index: questionIndex,
      });
      if (error) { console.error("Diagnostic question error:", error); return; }
      setQuestionData(data[0] ?? null);
    } else {
      const { data, error } = await supabase.rpc("get_random_question", {
        p_test_id: testID,
      });
      if (error) { console.error("Question error:", error); return; }
      setQuestionData(data[0] ?? null);
    }
  };

  const getCurrenTest = async (): Promise<Test | null> => {
    const { data, error } = await supabase.from("tests").select("*").eq("id", testID);
    if (error) { console.error("Test not found:", error); return null; }
    const test = data[0] as Test;
    setCurrentTest(test);
    return test;
  };

  // Returns the highest order_index already answered for this test session.
  // Returns 0 if no questions have been answered yet.
  const getLastAnsweredIndex = async (): Promise<number> => {
    if (!user) return 0;
    const { data } = await supabase
      .from("questions")
      .select("order_index")
      .eq("test_id", testID)
      .eq("user_id", user.id)
      .order("order_index", { ascending: false })
      .limit(1);
    return data?.[0]?.order_index ?? 0;
  };

  // Loads a previously answered question by order_index (for back/forward review).
  const loadQuestionAtIndex = async (index: number) => {
    if (!user) return;
    const { data: record } = await supabase
      .from("questions")
      .select("id, student_answer")
      .eq("test_id", testID)
      .eq("user_id", user.id)
      .eq("order_index", index)
      .single();

    if (!record) return;

    const { data: qData } = await supabase.rpc("get_question_by_uid", {
      p_uid: record.id,
    });

    if (qData?.[0]) {
      setQuestionData(qData[0]);
      setPreviousAnswer(record.student_answer);
      setCurrentQuestion(index);
    }
  };

  // ─── Action handlers ────────────────────────────────────────────────────────

  // Submit the current answer and advance to the next question.
  const handleSubmit = async () => {
    if (!user || !questionData) return;

    const { error } = await supabase.from("questions").upsert(
      {
        id: questionData.uid,
        test_id: testID,
        user_id: user.id,
        student_answer: chosenAnswer,
        order_index: currentQuestion,
      },
      { onConflict: "test_id, user_id, id" }
    );

    if (error) { console.error("Answer not submitted:", error); return; }

    if (currentTest && Number(currentTest.total_questions) === Number(currentQuestion)) {
      navigate("/home");
      return;
    }

    const nextIndex = currentQuestion + 1;
    setLatestQuestion(nextIndex);
    setCurrentQuestion(nextIndex);
    setChosenAnswer("");
    setNullSubmission(false);
    getQuestion(currentTest, nextIndex);
  };

  // Clicking the right arrow either submits (on active question) or advances review.
  const handleForward = async () => {
    if (isReadOnly) {
      const nextIndex = currentQuestion + 1;
      if (nextIndex < latestQuestion) {
        await loadQuestionAtIndex(nextIndex);
      } else {
        // Return to the active unanswered question
        setCurrentQuestion(latestQuestion);
        setQuestionData(activeQuestionData);
        setPreviousAnswer("");
      }
    } else {
      if (!chosenAnswer) { setNullSubmission(true); return; }
      await handleSubmit();
    }
  };

  // Clicking the left arrow — only reachable when isPassageQuestion is true.
  const handleBack = async () => {
    if (currentQuestion <= 1) return;
    // Save the active question before entering review mode
    if (!isReadOnly) setActiveQuestionData(questionData);
    await loadQuestionAtIndex(currentQuestion - 1);
  };

  // ─── Effects ─────────────────────────────────────────────────────────────────

  // Initialize once when the user context is ready
  useEffect(() => {
    if (!user || hasInitialized.current) return;
    hasInitialized.current = true;

    const init = async () => {
      const test = await getCurrenTest();
      const lastAnswered = await getLastAnsweredIndex();
      const startIndex = lastAnswered + 1;

      // If the test was already fully completed, go home
      if (test && lastAnswered >= test.total_questions) {
        navigate("/home");
        return;
      }

      setLatestQuestion(startIndex);
      setCurrentQuestion(startIndex);
      await getQuestion(test, startIndex);
    };

    init();
  }, [user]);

  // Fetch media whenever the displayed question changes
  useEffect(() => {
    if (!questionData?.uid) { setMediaItems([]); return; }

    const fetchMedia = async () => {
      const { data } = await supabase
        .from("dictionary_of_media")
        .select("*")
        .eq("question_id", questionData.uid)
        .order("index");
      setMediaItems((data as MediaItem[]) ?? []);
    };

    fetchMedia();
  }, [questionData?.uid]);

  // Start countdown when test loads with duration > 0 (0 = untimed)
  useEffect(() => {
    if (!currentTest || currentTest.duration === 0) return;
    setTimeRemaining(currentTest.duration * 60);
    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [currentTest]);

  // Navigate home when timer runs out
  useEffect(() => {
    if (timeRemaining === 0 && currentTest && currentTest.duration > 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      navigate("/home");
    }
  }, [timeRemaining]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col w-full h-full">
      {/* Header */}
      <div className="flex flex-row w-full px-10 py-3 gap-6 items-center justify-between border-b border-gray-300">
        <div className="flex flex-row gap-6 items-center">
          <h2 className="md:text-2xl text-xl">
            {currentTest ? currentTest.test_name : "Loading..."}
          </h2>

          <div className="flex items-center">
            {/* Back arrow — only shown for multi-question passage questions */}
            {isPassageQuestion && (
              <button
                type="button"
                className="bg-white border shadow-md px-3 py-1.5 hover:bg-blue-300 rounded-md rounded-r-none"
                onClick={handleBack}
              >
                {icons.arrowLeft}
              </button>
            )}
            <button
              type="button"
              className={`bg-white border shadow-md px-3 py-1.5 hover:bg-blue-300 rounded-md ${isPassageQuestion ? "rounded-l-none" : ""}`}
              onClick={handleForward}
            >
              {icons.arrowRight}
            </button>
            <button type="button" className="ml-2" onClick={() => navigate("/home")}>
              {icons.home}
            </button>
          </div>
        </div>

        <h2 className="md:text-2xl text-xl">
          {currentTest ? `${currentQuestion}/${currentTest.total_questions}` : "Loading..."}
        </h2>

        <div className="flex flex-row gap-6 items-center">
          <h2 className="md:text-2xl text-xl">
            {timeRemaining !== null ? formatTime(timeRemaining) : "Untimed"}
          </h2>
          <h2 className="md:text-2xl text-xl">{user?.first_name}</h2>
        </div>
      </div>

      {/* Question area */}
      <div className="flex flex-col items-center justify-center py-6">
        {questionData ? (
          <div className="flex flex-col border border-gray-300 gap-4 shadow-xl px-6 py-6 md:w-3xl sm:w-xl w-xs">

            <h3 className="md:text-xl text-md font-medium">
              Question {currentQuestion}
              {isReadOnly && (
                <span className="ml-2 text-sm font-normal text-gray-400">(review — read only)</span>
              )}
            </h3>

            {/* Passage, graph, table, or equation — displayed above question text */}
            <MediaDisplay mediaItems={displayMedia} />

            {/* Question text with bold/underline/italic formatting */}
            <div className="text-base leading-relaxed">
              {parseFormattedText(questionData.text ?? "")}
            </div>

            {nullSubmission && (
              <p className="text-sm text-red-600 font-bold animate-bounce">
                Select an answer before continuing.
              </p>
            )}

            {/* Answer input — key forces full remount on question change */}
            <QuestionRenderer
              key={currentQuestion}
              chosenAnswer={setChosenAnswer}
              type={questionData.type as "mcq" | "grid-in"}
              uid={questionData.uid}
              options={[
                questionData.choice_1,
                questionData.choice_2,
                questionData.choice_3,
                questionData.choice_4,
              ]}
              answer={questionData.answer}
              isReadOnly={isReadOnly}
              previousAnswer={previousAnswer}
              choiceImages={choiceImages}
            />
          </div>
        ) : (
          <p className="text-gray-500">Loading question...</p>
        )}
      </div>
    </div>
  );
}

export default MockTest;
