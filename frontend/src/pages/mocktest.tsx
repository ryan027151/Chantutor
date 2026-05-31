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

interface GraphPoint { x: number; y: number; }

// Returns true when the student's answer matches the correct answer.
// MCQ: letter-prefix comparison.
// Grid-in: numeric comparison with fraction/decimal normalisation.
// linear_graphing: checks both student points lie on the correct line.
function checkAnswer(student: string, correct: string, type: string): boolean {
  if (!student.trim() || !correct.trim()) return false;

  if (type === "linear_graphing") {
    try {
      const { p1, p2 } = JSON.parse(student) as { p1: GraphPoint; p2: GraphPoint };
      const expected = JSON.parse(correct) as {
        m?: number; b?: number; vertical?: boolean; x?: number;
      };
      if (expected.vertical) {
        // Both points must share x = expected.x and be distinct in y
        return p1.x === expected.x && p2.x === expected.x && p1.y !== p2.y;
      }
      const m = expected.m ?? 0;
      const b = expected.b ?? 0;
      const tol = 0.01;
      return (
        Math.abs(p1.y - (m * p1.x + b)) < tol &&
        Math.abs(p2.y - (m * p2.x + b)) < tol
      );
    } catch { return false; }
  }

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

const GRAMMAR_SUBCATEGORIES = [
  "Comma_Usage","Organization-Concluding_Sentence","Organization-Logical_Placement",
  "Organization-Paragraph_Unity","Organization-Topic_Sentence","Organization-Transitions",
  "Pronoun_Agreement","Sentence_Combining","Sentence_Structure",
  "Style-Word_Choice","Subject-Verb_Agreement","Verb_Tense",
];

interface PassageGroup {
  passage_id: string;
  tier: string;
  question_ids: string[];
  passage_type: string;
}

interface MathGroup {
  groupId: string;   // media_id for shared-media groups, uid for standalone
  uids: string[];    // ordered question UIDs
  tier: string;      // 'easy' | 'medium' | 'hard'
}

function diffToNum(d: string | null): number {
  const s = (d ?? "medium").toLowerCase();
  return s === "easy" ? 1 : s === "hard" ? 3 : 2;
}

function numToTier(avg: number): string {
  return avg < 1.67 ? "easy" : avg < 2.34 ? "medium" : "hard";
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("wrong_answer_key");
  const [reportDesc, setReportDesc] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportDone, setReportDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasInitialized = useRef(false);
  const currentSubjectRef = useRef<string>("");
  const questionStartTimeRef = useRef<number>(Date.now());
  const answeredIdsRef = useRef<Set<string>>(new Set());
  // Math adaptive: difficulty-based group selection
  const mathHistThetaRef        = useRef<number>(0.5);
  const mathCorrectRef          = useRef<number>(0);
  const mathAttemptedRef        = useRef<number>(0);
  const mathGroupsRef           = useRef<MathGroup[]>([]);
  const currentMathGroupUidsRef = useRef<string[]>([]);
  const currentMathGroupPosRef  = useRef<number>(0);
  const usedMathGroupsRef       = useRef<Set<string>>(new Set());

  // English RC: dynamic per-passage selection based on running performance
  const passagePoolRef        = useRef<PassageGroup[]>([]);  // all RC passages available
  const historicalThetaRef    = useRef<number>(0.5);         // θ from history before test
  const rcCorrectRef          = useRef<number>(0);           // correct RC answers this test
  const rcAttemptedRef        = useRef<number>(0);           // attempted RC answers this test
  const rcTargetRef           = useRef<number>(0);           // how many RC questions to serve
  const rcServedRef           = useRef<number>(0);           // how many RC questions served so far
  const usedPassagesRef       = useRef<Set<string>>(new Set());
  const currentPassageUidsRef = useRef<string[]>([]);        // UIDs of the active passage
  const currentPassagePosRef  = useRef<number>(0);           // position within active passage

  // English grammar: pre-built flat queue (grammar passages then standalone)
  const grammarQueueRef = useRef<string[]>([]);
  const grammarPosRef   = useRef<number>(0);

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

  // ─── Adaptive English initialisation ────────────────────────────────────────

  // Picks the next RC passage based on blended historical + current-test θ.
  // Called at test start (first passage) and automatically after each passage
  // is exhausted during getQuestion, so difficulty adjusts in real time.
  function selectNextRCPassage() {
    const attempted = rcAttemptedRef.current;
    const correct   = rcCorrectRef.current;
    const hist      = historicalThetaRef.current;

    // Weight rises 0 → 0.85 as current-test answers accumulate (historical dominates early)
    const w     = Math.min(attempted / (attempted + 10), 0.85);
    const theta = attempted > 0 ? hist * (1 - w) + (correct / attempted) * w : hist;

    const targetTier =
      theta < 0.45  ? "easier" :
      theta >= 0.70 ? "harder" : "medium";

    const tierPriority =
      targetTier === "easier" ? ["easier", "medium", "harder"] :
      targetTier === "harder" ? ["harder", "medium", "easier"] :
                                ["medium", "easier", "harder"];

    const available = passagePoolRef.current.filter(
      p => !usedPassagesRef.current.has(p.passage_id)
    );

    for (const tier of tierPriority) {
      const candidates = available.filter(p => p.tier === tier);
      if (candidates.length > 0) {
        const selected = candidates[Math.floor(Math.random() * candidates.length)];
        currentPassageUidsRef.current = selected.question_ids;
        currentPassagePosRef.current  = 0;
        usedPassagesRef.current.add(selected.passage_id);
        return;
      }
    }
    currentPassageUidsRef.current = []; // pool exhausted
  }

  const initEnglishAdaptive = async (test: Test) => {
    if (!user || test.test_name === "Diagnostic Test") return;
    const config = test.configuration as Record<string, unknown> | null;
    if ((config?.practice_topics as string[] ?? []).length > 0) return;

    const englishCfg = config?.english as { count?: number } | null;
    const englishCount = englishCfg?.count ?? Math.floor(test.total_questions / 2);

    // SHSAT ratio: 46 RC / 11 grammar out of 57 English questions
    const rcTarget      = Math.round(englishCount * (46 / 57));
    const grammarTarget = englishCount - rcTarget;
    rcTargetRef.current = rcTarget;

    // Fetch passage pool and historical θ in parallel
    const [{ data: passages }, { data: thetaRaw }] = await Promise.all([
      supabase.rpc("get_english_passage_pool"),
      supabase.rpc("get_student_rc_accuracy", { p_user_id: user.id }),
    ]);

    historicalThetaRef.current = (thetaRaw as number | null) ?? 0.5;

    const pool = (passages ?? []) as PassageGroup[];
    passagePoolRef.current = pool.filter(p => p.passage_type === "rc");
    const grammarPassages  = pool.filter(p => p.passage_type === "grammar");

    // Select first RC passage based on historical θ
    selectNextRCPassage();

    // Grammar queue: grammar passages (non-adaptive, random order) → standalone
    const grammarPassageTarget = Math.round(grammarTarget * 0.8);
    const grammarPassageUids: string[] = [];
    for (const passage of shuffle(grammarPassages)) {
      if (grammarPassageUids.length >= grammarPassageTarget) break;
      grammarPassageUids.push(...passage.question_ids);
    }

    const { data: grammarPool } = await supabase
      .from("all_questions")
      .select("uid")
      .eq("status", "approved")
      .eq("subject", "english")
      .in("sub_category", GRAMMAR_SUBCATEGORIES);

    const grammarPassageUidSet = new Set(grammarPassageUids);
    const standaloneGrammarUids = shuffle(
      (grammarPool ?? [])
        .map((q: { uid: string }) => q.uid)
        .filter((uid: string) => !grammarPassageUidSet.has(uid))
    ).slice(0, grammarTarget - grammarPassageUids.length);

    grammarQueueRef.current = [...grammarPassageUids, ...standaloneGrammarUids];
    grammarPosRef.current   = 0;
  };

  // Picks next math group (or standalone question) based on blended θ.
  // Called at test start (first group) and at every group boundary during the test.
  function selectNextMathGroup() {
    const attempted = mathAttemptedRef.current;
    const correct   = mathCorrectRef.current;
    const hist      = mathHistThetaRef.current;

    const w     = Math.min(attempted / (attempted + 8), 0.85);
    const theta = attempted > 0 ? hist * (1 - w) + (correct / attempted) * w : hist;

    const targetTier =
      theta < 0.40  ? "easy"   :
      theta >= 0.65 ? "hard"   : "medium";

    const tierPriority =
      targetTier === "easy" ? ["easy", "medium", "hard"] :
      targetTier === "hard" ? ["hard", "medium", "easy"] :
                              ["medium", "easy", "hard"];

    const available = mathGroupsRef.current.filter(
      g => !usedMathGroupsRef.current.has(g.groupId)
    );

    for (const tier of tierPriority) {
      const candidates = available.filter(g => g.tier === tier);
      if (candidates.length > 0) {
        const selected = candidates[Math.floor(Math.random() * candidates.length)];
        currentMathGroupUidsRef.current = selected.uids;
        currentMathGroupPosRef.current  = 0;
        usedMathGroupsRef.current.add(selected.groupId);
        return;
      }
    }
    currentMathGroupUidsRef.current = []; // pool exhausted
  }

  const initMathAdaptive = async (test: Test) => {
    if (!user || test.test_name === "Diagnostic Test") return;
    const config = test.configuration as Record<string, unknown> | null;
    if ((config?.practice_topics as string[] ?? []).length > 0) return;

    // Fetch pool and historical θ in parallel
    const [{ data: pool }, { data: thetaRaw }] = await Promise.all([
      supabase.rpc("get_math_question_pool"),
      supabase.rpc("get_student_math_accuracy", { p_user_id: user.id }),
    ]);

    mathHistThetaRef.current = (thetaRaw as number | null) ?? 0.5;

    if (!pool || (pool as unknown[]).length === 0) return;

    type PoolRow = { uid: string; sub_category: string | null; difficulty: string | null; media_group: string | null; grp_position: number };
    const rows = (pool as PoolRow[]);

    // Build MathGroups: media-grouped questions form one group, standalone = group of 1
    const groupMap = new Map<string, PoolRow[]>();
    for (const row of rows) {
      const key = row.media_group ?? `__solo__${row.uid}`;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(row);
    }

    mathGroupsRef.current = [...groupMap.entries()].map(([groupId, qs]) => {
      // Sort within group by grp_position (preserves original exam order for media groups)
      const sorted = [...qs].sort((a, b) => a.grp_position - b.grp_position);
      const avgDiff = sorted.reduce((s, q) => s + diffToNum(q.difficulty), 0) / sorted.length;
      return {
        groupId,
        uids: sorted.map(q => q.uid),
        tier: numToTier(avgDiff),
      };
    });

    // Select first group based on historical θ
    selectNextMathGroup();
  };

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
      const answeredIds = answeredIdsRef.current;

      // Fetch pool of available UIDs — only approved questions, filtered by subject or topics
      const config = test.configuration as unknown as Record<string, unknown> | null;
      const topics: string[] = config?.practice_topics as string[] ?? [];
      const englishCfg = config?.english as { count?: number } | null | undefined;
      const englishCount = englishCfg?.count ?? Math.floor(test.total_questions / 2);
      const isEnglishSlot = topics.length === 0 && questionIndex <= englishCount;

      // Adaptive English — passages served atomically; difficulty adjusts between passages only
      if (isEnglishSlot && rcTargetRef.current > 0) {

        // Skip already-answered UIDs within the active passage (handles test resume)
        while (
          currentPassagePosRef.current < currentPassageUidsRef.current.length &&
          answeredIds.has(currentPassageUidsRef.current[currentPassagePosRef.current])
        ) {
          currentPassagePosRef.current++;
        }

        const passageHasMore =
          currentPassagePosRef.current < currentPassageUidsRef.current.length;

        if (passageHasMore) {
          // ── Mid-passage: ALWAYS continue — passage must be completed before anything else ──
          const uid = currentPassageUidsRef.current[currentPassagePosRef.current++];
          rcServedRef.current++;
          const { data: qData, error } = await supabase
            .from("all_questions")
            .select("uid, text, answer, type, choice_1, choice_2, choice_3, choice_4, subject, sub_category, difficulty")
            .eq("uid", uid)
            .single();
          if (!error && qData) {
            questionStartTimeRef.current = Date.now();
            setQuestionData(qData as unknown as Record<string, string>);
            return qData as unknown as Record<string, string>;
          }

        } else if (rcServedRef.current < rcTargetRef.current) {
          // ── Passage boundary + RC quota not yet met: select next passage ──────
          // θ is recomputed here using all answers so far, so this is where adaptation happens
          selectNextRCPassage();
          if (currentPassagePosRef.current < currentPassageUidsRef.current.length) {
            const uid = currentPassageUidsRef.current[currentPassagePosRef.current++];
            rcServedRef.current++;
            const { data: qData, error } = await supabase
              .from("all_questions")
              .select("uid, text, answer, type, choice_1, choice_2, choice_3, choice_4, subject, sub_category, difficulty")
              .eq("uid", uid)
              .single();
            if (!error && qData) {
              questionStartTimeRef.current = Date.now();
              setQuestionData(qData as unknown as Record<string, string>);
              return qData as unknown as Record<string, string>;
            }
          }

        } else {
          // ── RC quota met (always at a passage boundary): switch to grammar ────
          while (
            grammarPosRef.current < grammarQueueRef.current.length &&
            answeredIds.has(grammarQueueRef.current[grammarPosRef.current])
          ) {
            grammarPosRef.current++;
          }
          if (grammarPosRef.current < grammarQueueRef.current.length) {
            const uid = grammarQueueRef.current[grammarPosRef.current++];
            const { data: qData, error } = await supabase
              .from("all_questions")
              .select("uid, text, answer, type, choice_1, choice_2, choice_3, choice_4, subject, sub_category, difficulty")
              .eq("uid", uid)
              .single();
            if (!error && qData) {
              questionStartTimeRef.current = Date.now();
              setQuestionData(qData as unknown as Record<string, string>);
              return qData as unknown as Record<string, string>;
            }
          }
        }
        // Fall through to random if all queues exhausted
      }

      // Adaptive math — media groups served atomically; difficulty adjusts between groups
      const isMathSlot = topics.length === 0 && !isEnglishSlot;
      if (isMathSlot && mathGroupsRef.current.length > 0) {

        // Skip already-answered UIDs within the active group (handles test resume)
        while (
          currentMathGroupPosRef.current < currentMathGroupUidsRef.current.length &&
          answeredIds.has(currentMathGroupUidsRef.current[currentMathGroupPosRef.current])
        ) {
          currentMathGroupPosRef.current++;
        }

        const groupHasMore =
          currentMathGroupPosRef.current < currentMathGroupUidsRef.current.length;

        if (groupHasMore) {
          // Mid-group: ALWAYS continue — never switch group mid-way
          const uid = currentMathGroupUidsRef.current[currentMathGroupPosRef.current++];
          const { data: qData, error } = await supabase
            .from("all_questions")
            .select("uid, text, answer, type, choice_1, choice_2, choice_3, choice_4, subject, sub_category, difficulty")
            .eq("uid", uid)
            .single();
          if (!error && qData) {
            questionStartTimeRef.current = Date.now();
            setQuestionData(qData as unknown as Record<string, string>);
            return qData as unknown as Record<string, string>;
          }
        } else {
          // Group boundary: pick next group based on current performance
          selectNextMathGroup();
          if (currentMathGroupPosRef.current < currentMathGroupUidsRef.current.length) {
            const uid = currentMathGroupUidsRef.current[currentMathGroupPosRef.current++];
            const { data: qData, error } = await supabase
              .from("all_questions")
              .select("uid, text, answer, type, choice_1, choice_2, choice_3, choice_4, subject, sub_category, difficulty")
              .eq("uid", uid)
              .single();
            if (!error && qData) {
              questionStartTimeRef.current = Date.now();
              setQuestionData(qData as unknown as Record<string, string>);
              return qData as unknown as Record<string, string>;
            }
          }
        }
        // Fall through to random if pool exhausted
      }

      let uidQuery = supabase.from("all_questions").select("uid").eq("status", "approved");
      if (topics.length > 0) {
        uidQuery = uidQuery.in("sub_category", topics);
      } else {
        const subject = isEnglishSlot ? "english" : "math";
        uidQuery = uidQuery.eq("subject", subject);
      }
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

  const initAnsweredIds = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("questions")
      .select("id")
      .eq("test_id", testID)
      .eq("user_id", user.id);
    answeredIdsRef.current = new Set((data ?? []).map((q: { id: string }) => q.id));
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

    answeredIdsRef.current.add(questionData.uid);

    // Update section performance counters for within-test adaptive selection
    const subj   = questionData.subject ?? "";
    const subCat = questionData.sub_category ?? "";
    if (subj === "english" && !GRAMMAR_SUBCATEGORIES.includes(subCat)) {
      rcAttemptedRef.current++;
      if (is_correct) rcCorrectRef.current++;
    } else if (subj === "math") {
      mathAttemptedRef.current++;
      if (is_correct) mathCorrectRef.current++;
    }

    if (currentTest && Number(currentTest.total_questions) === Number(currentQuestion)) {
      localStorage.removeItem(`timerRemaining_${testID}`);
      await markTestComplete();
      navigate(`/results/${testID}`);
      return;
    }

    const nextIndex = currentQuestion + 1;
    // Clear the answer immediately so the UI feels responsive on click,
    // but defer currentQuestion/latestQuestion until the next question is ready
    // so there is never an intermediate state where the question index has advanced
    // but questionData still holds the previous question.
    setChosenAnswer("");
    setNullSubmission(false);
    let nextQuestion = await getQuestion(currentTest, nextIndex);

    // For Diagnostic tests, a missing question in the bank should not end the test —
    // scan forward to find the next available question.
    if (!nextQuestion && currentTest.test_name === "Diagnostic Test" && nextIndex < Number(currentTest.total_questions)) {
      let skipIdx = nextIndex + 1;
      while (skipIdx <= Number(currentTest.total_questions) && !nextQuestion) {
        nextQuestion = await getQuestion(currentTest, skipIdx);
        if (!nextQuestion) skipIdx++;
      }
      if (nextQuestion) {
        setLatestQuestion(skipIdx);
        setCurrentQuestion(skipIdx);
      }
    } else if (nextQuestion) {
      // Normal path: advance index now that the question is ready
      setLatestQuestion(nextIndex);
      setCurrentQuestion(nextIndex);
    }

    if (!nextQuestion) {
      // Question pool exhausted (e.g. all topics done before total_questions reached)
      localStorage.removeItem(`timerRemaining_${testID}`);
      await markTestComplete();
      navigate(`/results/${testID}`);
      return;
    }

    const prevSubject = currentSubjectRef.current;
    const nextSubject = (nextQuestion.subject ?? "").toLowerCase();
    currentSubjectRef.current = nextSubject;
    if (prevSubject === "english" && nextSubject === "math") {
      setShowSectionBreak(true);
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
      // Graphing questions always have an answer (the grapher sets it on mount)
      if (!chosenAnswer && questionData?.type !== "linear_graphing") {
        setNullSubmission(true);
        return;
      }
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

  // ─── Report ──────────────────────────────────────────────────────────────────

  async function submitReport() {
    if (!user || !currentTest || !questionData) return;
    setReportSubmitting(true);
    const { error } = await supabase.from("question_reports").insert([{
      user_id: user.id,
      test_id: currentTest.id,
      question_uid: questionData.uid ?? null,
      order_index: currentQuestion,
      test_name: currentTest.test_name,
      reason: reportReason,
      description: reportDesc.trim() || null,
      status: "pending",
    }]);
    setReportSubmitting(false);
    if (!error) {
      setReportDone(true);
      setTimeout(() => {
        setShowReportModal(false);
        setReportDone(false);
        setReportDesc("");
        setReportReason("wrong_answer_key");
      }, 1800);
    }
  }

  // ─── Effects ─────────────────────────────────────────────────────────────────

  // Initialize once when the user context is ready
  useEffect(() => {
    if (!user || hasInitialized.current) return;
    hasInitialized.current = true;

    const init = async () => {
      const [test, lastAnswered] = await Promise.all([
        getCurrenTest(),
        getLastAnsweredIndex(),
        initAnsweredIds(),
      ]);
      const startIndex = lastAnswered + 1;

      // If the test was already fully completed, go home
      if (test && lastAnswered >= test.total_questions) {
        navigate("/home");
        return;
      }

      // Build adaptive question pools before first question loads
      if (test) await Promise.all([initEnglishAdaptive(test), initMathAdaptive(test)]);

      setLatestQuestion(startIndex);
      setCurrentQuestion(startIndex);
      let question = await getQuestion(test, startIndex);

      // Diagnostic: if a question slot is missing, find the next available one.
      if (!question && test?.test_name === "Diagnostic Test" && startIndex < Number(test.total_questions)) {
        let skipIdx = startIndex + 1;
        while (skipIdx <= Number(test.total_questions) && !question) {
          question = await getQuestion(test, skipIdx);
          if (!question) skipIdx++;
        }
        if (question) {
          setLatestQuestion(skipIdx);
          setCurrentQuestion(skipIdx);
        }
      }

      if (question) {
        currentSubjectRef.current = (question.subject ?? "").toLowerCase();
        setTestReady(true);
      }
    };

    init();
  }, [user]);

  // Fetch media whenever the active question changes.
  // We replace directly (no pre-clear) so passage-based questions sharing the same
  // media don't flash blank between consecutive questions in the same passage.
  // A cancel flag prevents stale responses from a slow previous fetch overwriting
  // the current question's media.
  useEffect(() => {
    if (!questionData?.uid) { setMediaItems([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("dictionary_of_media")
        .select("*")
        .eq("question_id", questionData.uid)
        .order("media_id");
      if (!cancelled) setMediaItems((data as MediaItem[]) ?? []);
    })();
    return () => { cancelled = true; };
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
                Some questions ask you to grid in your own answer or graph a line. Use these formats:
              </p>
              <div className="flex flex-col divide-y divide-slate-100">
                {[
                  { type: "Whole number", format: "Just the number", example: "42" },
                  { type: "Fraction", format: "numerator/denominator", example: "3/4" },
                  { type: "Mixed number", format: "Convert to improper fraction", example: "7/2" },
                  { type: "Decimal", format: "Use a decimal point", example: "0.75" },
                  { type: "Negative", format: "Use a minus sign", example: "-5" },
                  { type: "Graphing", format: "Drag two points onto the line", example: "⊙ drag" },
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

      {/* Flag button — fixed bottom-right, only when a live question is shown */}
      {questionData && !isReadOnly && (
        <button
          type="button"
          onClick={() => setShowReportModal(true)}
          className="fixed bottom-6 right-6 z-20 flex items-center gap-1.5 bg-white border border-slate-200 shadow-md rounded-full px-3.5 py-2 text-xs font-medium text-slate-500 hover:text-amber-600 hover:border-amber-300 hover:shadow-lg transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-9.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
          </svg>
          Flag
        </button>
      )}

      {/* Report modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Report a Problem</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Question {currentQuestion} · {currentTest?.test_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="text-slate-400 hover:text-slate-600 w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            {reportDone ? (
              <div className="flex flex-col items-center gap-2 py-4">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-slate-700">Report submitted — thank you!</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-700">Reason</label>
                  <select
                    value={reportReason}
                    title="Report reason"
                    onChange={(e) => setReportReason(e.target.value)}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="wrong_answer_key">Wrong answer key</option>
                    <option value="typo_formatting">Typo or formatting issue</option>
                    <option value="unclear_question">Unclear or ambiguous question</option>
                    <option value="missing_broken_image">Missing or broken image</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-700">
                    Details <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={reportDesc}
                    onChange={(e) => setReportDesc(e.target.value)}
                    placeholder="Describe the issue…"
                    rows={3}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                  />
                </div>

                <button
                  type="button"
                  disabled={reportSubmitting}
                  onClick={submitReport}
                  className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white py-2.5 rounded-xl font-semibold text-sm transition-colors"
                >
                  {reportSubmitting ? "Submitting…" : "Submit Report"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

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
                type={questionData.type as "mcq" | "grid-in" | "linear_graphing"}
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
