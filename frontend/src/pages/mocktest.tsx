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

// Extracts the leading letter (A–H) from a choice string like "A) text", "E. text", or just "A".
function choiceLetterOf(s: string): string {
  const m = s.trim().match(/^([A-Ha-h])[).:\s]?/);
  return m ? m[1].toUpperCase() : s.trim().toUpperCase();
}

// Returns true when the student's answer matches the correct answer.
// MCQ: compares just the letter prefix so "A) text" == "A".
// Grid-in: normalises fractions and decimals numerically; falls back to trimmed string compare.
function checkAnswer(student: string, correct: string, type: string): boolean {
  if (!student.trim() || !correct.trim()) return false;

  if (type === "mcq") {
    return choiceLetterOf(student) === choiceLetterOf(correct);
  }

  // Grid-in: convert "3/4" → 0.75, "0.75" → 0.75, "42" → 42
  const toNum = (raw: string): number | null => {
    const t = raw.trim();
    if (t.includes("/")) {
      const [n, d] = t.split("/").map(Number);
      return Number.isFinite(n) && Number.isFinite(d) && d !== 0 ? n / d : null;
    }
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : null;
  };

  const sv = toNum(student);
  const cv = toNum(correct);
  if (sv !== null && cv !== null) return Math.abs(sv - cv) < 0.0001;

  // Non-numeric grid-in (shouldn't happen normally) — plain string match
  return student.trim().toLowerCase() === correct.trim().toLowerCase();
}

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
  const [testReady, setTestReady] = useState(false);
  const [showSectionBreak, setShowSectionBreak] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasInitialized = useRef(false);
  const currentSubjectRef = useRef<string>("");
  const questionStartTimeRef = useRef<number>(Date.now());

  const navigate = useNavigate();
  const user = useContext(UserContext);
  const { testID } = useParams();

  // Derived values — recalculated every render, no extra state needed
  const isReadOnly = currentQuestion < latestQuestion;

  // Split mediaItems into display media (passage/graph/table/equation)
  // and number-line choice images
  const displayMedia = mediaItems
    .filter((m) => !isChoiceMedia(m.media_id))
    .sort((a, b) => {
      const suffixA = a.media_id.split("_").pop() ?? "";
      const suffixB = b.media_id.split("_").pop() ?? "";
      return suffixA.localeCompare(suffixB);
    });
  const choiceImages: Record<string, string> = {};
  mediaItems
    .filter((m) => isChoiceMedia(m.media_id))
    .forEach((m) => { choiceImages[choiceLetter(m.media_id)] = m.content; });

  // Back button is shown for passage questions (active mode) or any question in review mode.
  // In active mode, isPassageQuestion gates entry into review.
  // Once reviewing, back stays available so the student can navigate the whole passage.
  const isPassageQuestion = mediaItems.some((m) => isMultiQuestionMedia(m.media_id));
  const showBackButton = currentQuestion > 1 && (isPassageQuestion || isReadOnly);

  // ─── Data fetching ──────────────────────────────────────────────────────────

  const getQuestion = async (test: Test | null, questionIndex: number): Promise<Record<string, string> | null> => {
    if (!test) return null;
    if (test.test_name === "Diagnostic Test") {
      const { data, error } = await supabase.rpc("get_diagnostic_question", {
        p_test_id: testID,
        p_order_index: questionIndex,
      });
      if (error || !data?.[0]) { console.error("Diagnostic question error:", error); return null; }
      questionStartTimeRef.current = Date.now();
      setQuestionData(data[0]);
      return data[0];
    } else {
      // Get already-answered UIDs for this test session to avoid repeats
      const { data: answeredData } = await supabase
        .from("questions")
        .select("id")
        .eq("test_id", testID)
        .eq("user_id", user?.id ?? "");
      const answeredIds = new Set<string>((answeredData ?? []).map((q: { id: string }) => q.id));

      // Fetch pool of available UIDs — filtered by topics if set
      const topics: string[] = (test.configuration as Record<string, unknown> | null)?.practice_topics as string[] ?? [];
      let uidQuery = supabase.from("all_questions").select("uid");
      if (topics.length > 0) uidQuery = uidQuery.in("sub_category", topics);
      const { data: uidPool } = await uidQuery;

      const available = (uidPool ?? [])
        .map((q: { uid: string }) => q.uid)
        .filter(uid => !answeredIds.has(uid));

      if (available.length === 0) return null;

      // Pick a random UID, then fetch the full question
      const uid = available[Math.floor(Math.random() * available.length)];
      const { data: qData, error } = await supabase
        .from("all_questions")
        .select("uid, text, answer, type, choice_1, choice_2, choice_3, choice_4, subject, sub_category, difficulty")
        .eq("uid", uid)
        .single();

      if (error || !qData) { console.error("Question fetch error:", error); return null; }
      questionStartTimeRef.current = Date.now();
      setQuestionData(qData as unknown as Record<string, string>);
      return qData as unknown as Record<string, string>;
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
    const { data: record, error: recordError } = await supabase
      .from("questions")
      .select("id, student_answer")
      .eq("test_id", testID)
      .eq("user_id", user.id)
      .eq("order_index", index)
      .maybeSingle();

    if (recordError) { console.error("loadQuestionAtIndex record error:", recordError); return; }
    if (!record) { console.warn("loadQuestionAtIndex: no record at index", index); return; }

    const { data: qData, error: qError } = await supabase.rpc("get_question_by_uid", {
      p_uid: record.id,
    });

    if (qError) { console.error("loadQuestionAtIndex get_question_by_uid error:", qError); return; }

    if (qData?.[0]) {
      setQuestionData(qData[0]);
      setPreviousAnswer(record.student_answer);
      setCurrentQuestion(index);
    }
  };

  // ─── Action handlers ────────────────────────────────────────────────────────

  const markTestComplete = async () => {
    if (!user || !currentTest) return;
    const { data: qData } = await supabase
      .from("questions")
      .select("is_correct")
      .eq("test_id", testID)
      .eq("user_id", user.id);
    const correct = (qData ?? []).filter((q: { is_correct: boolean | null }) => q.is_correct === true).length;
    const pct = currentTest.total_questions > 0
      ? Math.round((correct / currentTest.total_questions) * 100)
      : 0;
    await supabase.from("tests").update({ score: pct }).eq("id", testID).is("score", null);
  };

  // Submit the current answer and advance to the next question.
  const handleSubmit = async () => {
    if (!user || !questionData) return;

    const is_correct = checkAnswer(
      chosenAnswer,
      questionData.answer ?? "",
      questionData.type ?? "mcq"
    );
    const time_spent = Math.round((Date.now() - questionStartTimeRef.current) / 1000);

    const { error } = await supabase.from("questions").upsert(
      {
        id: questionData.uid,
        test_id: testID,
        user_id: user.id,
        student_answer: chosenAnswer,
        is_correct,
        time_spent,
        order_index: currentQuestion,
      },
      { onConflict: "test_id, user_id, id" }
    );

    if (error) { console.error("Answer not submitted:", error); return; }

    if (currentTest && Number(currentTest.total_questions) === Number(currentQuestion)) {
      localStorage.removeItem(`timerRemaining_${testID}`);
      await markTestComplete();
      navigate(`/results/${testID}`);
      return;
    }

    const nextIndex = currentQuestion + 1;
    setLatestQuestion(nextIndex);
    setCurrentQuestion(nextIndex);
    setChosenAnswer("");
    setNullSubmission(false);
    const nextQuestion = await getQuestion(currentTest, nextIndex);
    if (!nextQuestion) {
      // Question pool exhausted (e.g. all topics done before total_questions reached)
      localStorage.removeItem(`timerRemaining_${testID}`);
      await markTestComplete();
      navigate(`/results/${testID}`);
      return;
    }
    if (nextQuestion) {
      const prevSubject = currentSubjectRef.current;
      const nextSubject = (nextQuestion.subject ?? "").toLowerCase();
      currentSubjectRef.current = nextSubject;
      if (prevSubject === "english" && nextSubject === "math") {
        setShowSectionBreak(true);
      }
    }
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
        questionStartTimeRef.current = Date.now();
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
      const question = await getQuestion(test, startIndex);
      if (question) {
        currentSubjectRef.current = (question.subject ?? "").toLowerCase();
        setTestReady(true);
      }
    };

    init();
  }, [user]);

  // Clear media immediately when the question index changes so old media never
  // bleeds into the next question during the async fetch gap.
  useEffect(() => {
    setMediaItems([]);
  }, [currentQuestion]);

  // Fetch media once the new question's uid is known
  useEffect(() => {
    if (!questionData?.uid) { setMediaItems([]); return; }

    const fetchMedia = async () => {
      const { data } = await supabase
        .from("dictionary_of_media")
        .select("*")
        .eq("question_id", questionData.uid)
        .order("media_id");
      setMediaItems((data as MediaItem[]) ?? []);
    };

    fetchMedia();
  }, [questionData?.uid]);

  // Start countdown only after the first question has loaded.
  // Remaining seconds are saved to localStorage every tick so the timer pauses
  // when the user closes or reloads the page and resumes exactly where they left off.
  useEffect(() => {
    if (!testReady || !currentTest || currentTest.duration === 0) return;

    const storageKey = `timerRemaining_${testID}`;
    const stored = localStorage.getItem(storageKey);
    let remaining = stored ? parseInt(stored, 10) : currentTest.duration * 60;

    if (remaining <= 0) {
      localStorage.removeItem(storageKey);
      navigate("/home");
      return;
    }

    setTimeRemaining(remaining);

    timerRef.current = setInterval(() => {
      remaining -= 1;
      localStorage.setItem(storageKey, remaining.toString());
      setTimeRemaining(remaining);
      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [testReady]);

  // Navigate to results when timer hits zero and clean up stored remaining time
  useEffect(() => {
    if (timeRemaining === 0 && currentTest && currentTest.duration > 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      localStorage.removeItem(`timerRemaining_${testID}`);
      (async () => {
        await markTestComplete();
        navigate(`/results/${testID}`);
      })();
    }
  }, [timeRemaining]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col w-full min-h-screen bg-slate-50">
      {/* Section transition overlay */}
      {showSectionBreak && (
        <div className="fixed inset-0 bg-slate-50 flex flex-col items-center justify-center z-50 p-8">
          <div className="max-w-lg w-full flex flex-col gap-5">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-1">English Section Complete</h1>
              <p className="text-slate-500 text-sm">You've finished all English Language Arts questions.</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h2 className="text-base font-bold text-slate-900 mb-1">Starting: Math Section</h2>
              <p className="text-sm text-slate-500 mb-4">
                Some questions ask you to grid in your own answer. Use these exact formats:
              </p>
              <div className="flex flex-col divide-y divide-slate-100">
                {[
                  { type: "Whole number", format: "Just the number", example: "42" },
                  { type: "Fraction", format: "numerator/denominator", example: "3/4" },
                  { type: "Mixed number", format: "Convert to improper fraction", example: "7/2" },
                  { type: "Decimal", format: "Use a decimal point", example: "0.75" },
                  { type: "Negative", format: "Use a minus sign", example: "-5" },
                ].map((row) => (
                  <div key={row.type} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="font-medium text-slate-700 w-32 shrink-0">{row.type}</span>
                    <span className="text-slate-400 flex-1 text-xs">{row.format}</span>
                    <span className="font-mono text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded text-xs">{row.example}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold transition-colors"
              onClick={() => setShowSectionBreak(false)}
            >
              Begin Math Section
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-slate-100 shadow-sm px-8 py-4 flex items-center justify-between shrink-0 sticky top-0 z-10">
        {/* Left: name + home */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <h1 className="text-sm font-bold text-slate-900 truncate">
            {currentTest?.test_name ?? "Loading…"}
          </h1>
          {currentTest?.test_name !== "Diagnostic Test" && (
            <button
              type="button"
              aria-label="Go home"
              onClick={() => navigate("/home")}
              className="text-slate-400 hover:text-slate-600 transition-colors shrink-0 ml-1"
            >
              {icons.home}
            </button>
          )}
        </div>

        {/* Center: question counter */}
        <div className="flex flex-col items-center shrink-0 px-4">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-400 leading-tight">Question</span>
          <span className="text-sm font-bold text-slate-800 tabular-nums">
            {currentTest ? `${currentQuestion} / ${currentTest.total_questions}` : "—"}
          </span>
        </div>

        {/* Right: timer */}
        <div className="flex items-center justify-end flex-1">
          {timeRemaining !== null ? (
            <span className={`font-mono text-sm font-semibold tabular-nums ${timeRemaining < 300 ? "text-red-500" : "text-slate-700"}`}>
              {formatTime(timeRemaining)}
            </span>
          ) : (
            <span className="text-xs text-slate-400 font-medium">Untimed</span>
          )}
        </div>
      </div>

      {/* Question area — overflow-x-auto so content scrolls rather than squeezes when viewport is narrow */}
      <div className="flex items-start justify-center py-8 px-6 flex-1 gap-4 overflow-x-auto">
        {questionData ? (
          <>
            {/* Left panel — 45% wide by default, resizable up to 65% of the viewport */}
            {displayMedia.length > 0 && (
              <div className="flex flex-col shrink-0 w-[45%] min-w-72 max-w-[65%] h-[calc(100vh-8rem)] min-h-48 resize overflow-auto bg-white rounded-2xl shadow-sm border border-slate-100 p-6 self-start sticky top-20">
                <MediaDisplay mediaItems={displayMedia} />
              </div>
            )}

            {/* Right panel — always at least 420px so question text never wraps awkwardly */}
            <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 p-8 flex flex-col gap-5 ${displayMedia.length > 0 ? "flex-1 min-w-105" : "w-full max-w-3xl"}`}>
              {/* Question label */}
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  Question {currentQuestion}
                </span>
                {isReadOnly && (
                  <span className="text-xs font-medium bg-amber-50 text-amber-600 border border-amber-200 rounded-full px-2.5 py-0.5">
                    Review
                  </span>
                )}
              </div>

              {/* Question text */}
              <div className="text-base leading-relaxed text-slate-800">
                {parseFormattedText(questionData.text ?? "")}
              </div>

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

              {/* Navigation row — back left, submit right */}
              <div className="flex items-center justify-between pt-1">
                <div>
                  {showBackButton && (
                    <button
                      type="button"
                      aria-label="Previous question"
                      onClick={handleBack}
                      className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 px-4 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 text-sm font-medium transition-colors"
                    >
                      {icons.arrowLeft}
                      Back
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {nullSubmission && (
                    <p className="text-sm text-rose-600 font-medium animate-bounce">
                      Select an answer before continuing.
                    </p>
                  )}
                  <button
                    type="button"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors"
                    onClick={handleForward}
                  >
                    {isReadOnly
                      ? currentQuestion + 1 < latestQuestion ? "Next" : "Resume"
                      : currentTest && Number(currentQuestion) === Number(currentTest.total_questions) ? "Finish" : "Submit"}
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <p className="text-slate-400 text-sm mt-16">Loading question…</p>
        )}
      </div>
    </div>
  );
}

export default MockTest;
