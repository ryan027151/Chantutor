import { supabase } from "../supabase-client";
import { useEffect, useState, useContext, useRef, useCallback } from "react";
import { icons } from "../assets/icons.tsx";
import { useNavigate } from "react-router-dom";
import QuestionRenderer from "../components/questionRenderer.tsx";
import MediaDisplay from "../components/mediaDisplay.tsx";
import { useParams } from "react-router-dom";
import { UserContext } from "../components/userContext.ts";
import { Test, MediaItem } from "../components/types.ts";
import { parseFormattedText } from "../utils/textParser.tsx";
import { useELATools } from "../hooks/useELATools";
import type { HighlightRect } from "../hooks/useELATools";
import ELAToolbar from "../components/ELAToolbar.tsx";
import ELAPencilCanvas from "../components/ELAPencilCanvas.tsx";
import ELANotepad from "../components/ELANotepad.tsx";
import ELALineMask from "../components/ELALineMask.tsx";

// Extracts the leading letter (A–H) from a choice string like "A) text", "E. text", or just "A".
function choiceLetterOf(s: string): string {
  const m = s.trim().match(/^([A-Ha-h])[).:\s]?/);
  return m ? m[1].toUpperCase() : s.trim().toUpperCase();
}

interface GraphPoint { x: number; y: number; }

// Returns true when the student's answer matches the correct answer.
// All types apply liberal normalization so minor formatting differences never mark a correct answer wrong.
function checkAnswer(student: string, correct: string, type: string): boolean {
  if (!student.trim() || !correct.trim()) return false;

  if (type === "multi-select") {
    const norm = (s: string) =>
      s.split(",").map(x => x.trim()).filter(Boolean).sort().join(",");
    return norm(student) === norm(correct);
  }

  if (type === "expression") {
    // 1. Strip all whitespace           "2n + 3"  → "2n+3"
    // 2. Unify operator Unicode          "2n−3"    → "2n-3"
    // 3. Remove explicit × between       "2×n"     → "2n"
    //    digit and variable (implicit mult after × → *)
    // 4. Flip variable×digit to canonical "n×2"    → "2n"
    //    (only when letter not preceded by a digit, to avoid mangling "2n*3")
    // 5. Normalize Unicode superscripts  "x²"      → "x^2"
    // 6. Lowercase                       "X+N"     → "x+n"
    const norm = (s: string) =>
      s
        .replace(/\s/g, "")
        .replace(/−/g, "-")                        // − → -
        .replace(/×/g, "*")                        // × → *
        .replace(/÷/g, "/")                        // ÷ → /
        .replace(/²/g, "^2")                       // ² → ^2
        .replace(/³/g, "^3")                       // ³ → ^3
        .replace(/(\d)\*([a-zA-Z])/g, "$1$2")           // 2*n → 2n
        .replace(/(?<!\d)([a-zA-Z])\*(\d+)/g, "$2$1")  // n*2 → 2n (not "2n*3")
        .toLowerCase();
    return norm(student) === norm(correct);
  }

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

  if (type === "mcq" || type === "inline-dropdown") {
    return choiceLetterOf(student) === choiceLetterOf(correct);
  }

  if (type === "number_line_click") {
    const sv = parseFloat(student);
    const cv = parseFloat(correct);
    return isFinite(sv) && isFinite(cv) && Math.abs(sv - cv) < 0.0001;
  }

  if (type === "table_row_radio" || type === "drag_fill_multiple" || type === "drag_to_bin" || type === "drag_to_categorize") {
    const normRow = (s: string) =>
      s.split(",").map(x => x.trim().toUpperCase()).join(",");
    return normRow(student) === normRow(correct);
  }

  if (type === "drag_fill_single") {
    return student.trim().toUpperCase() === correct.trim().toUpperCase();
  }

  // ── Grid-in ───────────────────────────────────────────────────────────────────
  // Accepts: "42", " 42 ", "3/4", "3 / 4", "0.75", ".75", "1,000",
  //          mixed number "1 1/2", negative "-3/4", space-grouped "1 024"
  const toNum = (raw: string): number | null => {
    // Step 1: remove thousands-separator commas and outer whitespace
    const t = raw.trim().replace(/,/g, "");

    if (t.includes("/")) {
      // Mixed number: "1 1/2" → 1.5, "-2 3/4" → -2.75
      const mixed = t.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
      if (mixed) {
        const whole = parseInt(mixed[1], 10);
        const num   = parseInt(mixed[2], 10);
        const den   = parseInt(mixed[3], 10);
        if (Number.isFinite(whole) && Number.isFinite(num) && den !== 0) {
          return whole + (whole < 0 ? -1 : 1) * (num / den);
        }
      }
      // Simple fraction: "3/4" or "3 / 4" — Number() tolerates surrounding spaces
      const parts = t.split("/");
      if (parts.length === 2) {
        const n = Number(parts[0]);
        const d = Number(parts[1]);
        return Number.isFinite(n) && Number.isFinite(d) && d !== 0 ? n / d : null;
      }
      return null;
    }

    // Strip any remaining internal spaces ("1 024" → "1024") then parse
    const compact = t.replace(/\s/g, "");
    if (!compact) return null;
    const n = parseFloat(compact);
    return Number.isFinite(n) ? n : null;
  };

  const sv = toNum(student);
  const cv = toNum(correct);
  if (sv !== null && cv !== null) return Math.abs(sv - cv) < 0.0001;

  // Non-numeric fallback: collapse whitespace + case-insensitive
  const normText = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return normText(student) === normText(correct);
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
// Only NLA, NLB, NLC, NLD are valid choice-image suffixes.
function isChoiceMedia(mediaId: string): boolean {
  const suffix = mediaId.split("_").pop() ?? "";
  return /^NL[ABCD]$/i.test(suffix);
}

// Extracts the choice letter from a number-line media_id ("24A_Q113_NLA" → "A").
function choiceLetter(mediaId: string): string {
  const suffix = mediaId.split("_").pop() ?? "";
  return suffix.slice(2).toUpperCase(); // "NLA" → "A", handles any input case
}

interface PendingSave {
  id: string; test_id: string; user_id: string;
  student_answer: string; is_correct: boolean;
  time_spent: number; order_index: number;
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
  // ELA annotation tools (only active for English questions)
  const elaTools = useELATools();
  const passageContainerRef = useRef<HTMLDivElement>(null);
  const questionTextContainerRef = useRef<HTMLDivElement>(null);

  // Capture the current text selection as highlight rects relative to a scrollable container
  function captureHighlight(containerEl: HTMLElement | null, key: string) {
    if (!containerEl) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!containerEl.contains(range.commonAncestorContainer)) return;
    const containerRect = containerEl.getBoundingClientRect();
    const rects: HighlightRect[] = Array.from(range.getClientRects())
      .filter(r => r.width > 2 && r.height > 2)
      .map(r => ({
        id: `h${Date.now()}${Math.random().toString(36).slice(2)}`,
        top: r.top - containerRect.top + containerEl.scrollTop,
        left: r.left - containerRect.left + containerEl.scrollLeft,
        width: r.width,
        height: r.height,
      }));
    if (rects.length) {
      elaTools.addHighlights(key, rects);
      sel.removeAllRanges();
    }
  }

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
  const [loadError, setLoadError] = useState(false);
  const [showSectionBreak, setShowSectionBreak] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("wrong_answer_key");
  const [reportDesc, setReportDesc] = useState("");
  const [showTestRules, setShowTestRules] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportDone, setReportDone] = useState(false);
  const [reportError, setReportError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasInitialized = useRef(false);
  const currentSubjectRef = useRef<string>("");
  const questionStartTimeRef = useRef<number>(Date.now());
  const answeredIdsRef  = useRef<Set<string>>(new Set());
  // Cross-session: UIDs the student has answered correctly in ANY past test session.
  // Populated once at init from the questions table; O(1) Set lookups everywhere else.
  const masteredIdsRef  = useRef<Set<string>>(new Set());
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
  const passageSetNumRef      = useRef<number>(0);           // how many passage sets have been started (1-indexed)
  const currentSetStartRef    = useRef<number>(1);           // first question index of the current active passage/group
  const [navPassageInfo, setNavPassageInfo] = useState({ setNum: 0, itemPos: 0, itemTotal: 0 });

  // English grammar: pre-built flat queue (grammar passages then standalone)
  const grammarQueueRef = useRef<string[]>([]);
  const grammarPosRef   = useRef<number>(0);

  // Practice queue: pre-built at test start (avoids 2-step UID-then-fetch per question)
  const practiceQueueRef    = useRef<string[]>([]);
  const practiceQueuePosRef = useRef<number>(0);
  // Resolved practice topics — set once in initPracticeQueue, read by getQuestion and adaptive inits
  const practiceTopicsRef   = useRef<string[]>([]);

  // Pre-fetch cache: stores the next question AND its media so both can be applied instantly
  const prefetchedRef  = useRef<{ uid: string; data: Record<string, string>; media: MediaItem[] } | null>(null);
  const prefetchingRef = useRef(false);
  // Set to a uid when media was applied synchronously from pre-fetch cache,
  // so the async media useEffect knows to skip the redundant DB fetch.
  const mediaSetForRef = useRef<string | null>(null);

  // Network resilience
  const [isOnline, setIsOnline]         = useState(() => navigator.onLine);
  const isOnlineRef                     = useRef(navigator.onLine);
  // Separate from isOnline: DB may be unreachable even when the network is up.
  const [isDbReachable, setIsDbReachable] = useState(true);
  const isDbReachableRef                = useRef(true);
  const pendingSavesRef                 = useRef<PendingSave[]>([]);
  const isFlushingRef                   = useRef(false);
  // pendingCount drives the save-status indicator in the UI (refs don't trigger re-render).
  const [pendingCount, setPendingCount] = useState(0);
  // Set when the test is blocked from completing because queued saves haven't flushed.
  const [saveError, setSaveError]       = useState<string | null>(null);
  // Stores a retry thunk when a question fetch failed due to DB being down.
  // Executed automatically by the DB-recovery ping when the server comes back.
  const pendingQuestionRetryRef         = useRef<(() => Promise<void>) | null>(null);

  const navigate = useNavigate();
  const user = useContext(UserContext);
  const { testID } = useParams();

  // Derived values — recalculated every render, no extra state needed
  const isReadOnly = currentQuestion < latestQuestion;
  // True when reviewing within the current active set — answers are editable (not locked)
  const isEditableReview = isReadOnly && currentQuestion >= currentSetStartRef.current;

  // Build choice images and the set of media_ids consumed as choices,
  // so they can be excluded from the display-media panel.
  const choiceImages: Record<string, string> = {};
  const choiceMediaIdSet = new Set<string>();

  // Pattern 1: NL-suffix number-line images (e.g. "24A_Q113_NLA")
  mediaItems
    .filter((m) => isChoiceMedia(m.media_id))
    .forEach((m) => {
      choiceImages[choiceLetter(m.media_id)] = m.content;
      choiceMediaIdSet.add(m.media_id);
    });

  // Pattern 2: choice value IS a media_id, with or without [bracket] wrapping
  // e.g. choice_1 = "25A_Q5_A"  or  choice_1 = "[25A_Q86_NLA]"
  if (questionData) {
    const mediaById = new Map(mediaItems.map((m) => [m.media_id, m.content]));
    (["choice_1", "choice_2", "choice_3", "choice_4"] as const).forEach((key, i) => {
      const raw = (questionData as Record<string, string | null>)[key]?.trim() ?? "";
      const val = raw.replace(/^\[(.+)\]$/, "$1"); // strip surrounding [brackets] if present
      if (val && mediaById.has(val)) {
        choiceImages["ABCD"[i]] = mediaById.get(val)!;
        choiceMediaIdSet.add(val);
      }
    });
  }

  // Display media = everything NOT consumed as a choice image
  const displayMedia = mediaItems
    .filter((m) => !choiceMediaIdSet.has(m.media_id))
    .sort((a, b) => {
      const suffixA = a.media_id.split("_").pop() ?? "";
      const suffixB = b.media_id.split("_").pop() ?? "";
      return suffixA.localeCompare(suffixB);
    });

  // Back button is shown for passage/group questions (active mode) or any reviewed question.
  // Students may NOT go back past the start of the current active set.
  const isPassageQuestion = mediaItems.some((m) => isMultiQuestionMedia(m.media_id));
  const showBackButton = currentQuestion > currentSetStartRef.current && (isPassageQuestion || isReadOnly);

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
        passageSetNumRef.current++;
        return;
      }
    }
    currentPassageUidsRef.current = []; // pool exhausted
  }

  const initEnglishAdaptive = async (test: Test) => {
    if (!user || test.test_name === "Diagnostic Test") return;
    if (practiceTopicsRef.current.length > 0) return;
    const config = test.configuration as Record<string, unknown> | null;
    const englishCfg = config?.english as { count?: number } | null;
    const englishCount = englishCfg?.count ?? Math.floor(test.total_questions / 2);

    // New SHSAT ratio: 47 RC / 3 R-E standalone out of 50 English questions
    const rcTarget      = Math.round(englishCount * (47 / 50));
    const grammarTarget = englishCount - rcTarget;
    rcTargetRef.current = rcTarget;

    // Fetch passage pool, historical θ, AND grammar UIDs all in parallel
    const [{ data: passages }, { data: thetaRaw }, { data: grammarPool }] = await Promise.all([
      supabase.rpc("get_english_passage_pool"),
      supabase.rpc("get_student_rc_accuracy", { p_user_id: user.id }),
      supabase.from("all_questions").select("uid").eq("status", "approved")
        .eq("subject", "english").in("sub_category", GRAMMAR_SUBCATEGORIES),
    ]);

    historicalThetaRef.current = (thetaRaw as number | null) ?? 0.5;

    const pool = (passages ?? []) as PassageGroup[];
    // Only keep RC passages that have at least one question the student hasn't mastered yet
    passagePoolRef.current = pool
      .filter(p => p.passage_type === "rc")
      .filter(p => (p.question_ids as string[]).some(uid => !masteredIdsRef.current.has(uid)));
    const grammarPassages  = pool.filter(p => p.passage_type === "grammar");

    // Select first RC passage based on historical θ
    selectNextRCPassage();

    // Grammar queue: grammar passages (non-adaptive, random order) → standalone
    // Skip any individual question the student has already mastered
    const grammarPassageTarget = Math.round(grammarTarget * 0.8);
    const grammarPassageUids: string[] = [];
    for (const passage of shuffle(grammarPassages)) {
      if (grammarPassageUids.length >= grammarPassageTarget) break;
      grammarPassageUids.push(
        ...(passage.question_ids as string[]).filter(uid => !masteredIdsRef.current.has(uid))
      );
    }

    const grammarPassageUidSet = new Set(grammarPassageUids);
    const standaloneGrammarUids = shuffle(
      (grammarPool ?? [])
        .map((q: { uid: string }) => q.uid)
        .filter((uid: string) => !grammarPassageUidSet.has(uid) && !masteredIdsRef.current.has(uid))
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
    if (practiceTopicsRef.current.length > 0) return;
    const config = test.configuration as Record<string, unknown> | null;

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
    // Drop groups where every question has already been mastered
    }).filter(g => g.uids.some(uid => !masteredIdsRef.current.has(uid)));

    // Select first group based on historical θ
    selectNextMathGroup();
  };

  // ─── Pre-fetch helpers ───────────────────────────────────────────────────────

  // Start a background fetch of the given UID — fetches question data AND media in parallel
  // so both can be applied synchronously (no async delay) when the student submits.
  function triggerPrefetch(uid: string) {
    if (prefetchingRef.current || prefetchedRef.current?.uid === uid || answeredIdsRef.current.has(uid)) return;
    prefetchingRef.current = true;
    Promise.all([
      supabase
        .from("all_questions")
        .select("uid, text, answer, type, choice_1, choice_2, choice_3, choice_4, extra_data, subject, sub_category, difficulty")
        .eq("uid", uid)
        .single(),
      supabase
        .from("dictionary_of_media")
        .select("*")
        .eq("question_id", uid)
        .order("media_id"),
    ]).then(([{ data: qData, error: qErr }, { data: mData }]) => {
      prefetchingRef.current = false;
      if (!qErr && qData) {
        const fetched = (qData as Record<string, string>).uid;
        if (!answeredIdsRef.current.has(fetched)) {
          prefetchedRef.current = {
            uid:   fetched,
            data:  qData as unknown as Record<string, string>,
            media: (mData as MediaItem[]) ?? [],
          };
        }
      }
    });
  }

  // Fetch a question by UID, using the pre-fetch cache when available.
  // On a cache hit, question data AND media are both applied synchronously —
  // no async delay, no risk of stale media from the previous question bleeding through.
  const fetchByUID = async (
    uid: string,
    nextUidToPrefetch?: string,
  ): Promise<Record<string, string> | null> => {
    if (prefetchedRef.current?.uid === uid) {
      const { data: cached, media: cachedMedia } = prefetchedRef.current;
      prefetchedRef.current = null;
      questionStartTimeRef.current = Date.now();
      // Mark that media is already set so the useEffect skips its async fetch
      mediaSetForRef.current = uid;
      setQuestionData(cached);
      setMediaItems(cachedMedia);
      if (nextUidToPrefetch) triggerPrefetch(nextUidToPrefetch);
      return cached;
    }
    // Cache miss: fetch question from DB; media will be fetched by the useEffect
    const { data, error } = await supabase
      .from("all_questions")
      .select("uid, text, answer, type, choice_1, choice_2, choice_3, choice_4, subject, sub_category, difficulty")
      .eq("uid", uid)
      .single();
    if (error || !data) return null;
    questionStartTimeRef.current = Date.now();
    setQuestionData(data as unknown as Record<string, string>);
    if (nextUidToPrefetch) triggerPrefetch(nextUidToPrefetch);
    return data as unknown as Record<string, string>;
  };

  // ─── Practice queue initialisation ───────────────────────────────────────────

  // Pre-builds a shuffled UID queue at test start so practice mode only needs
  // one DB call per question instead of the 2-step UID-pool → full-fetch approach.
  const initPracticeQueue = async (test: Test) => {
    if (!user || test.test_name === "Diagnostic Test") return;
    const config = test.configuration as Record<string, unknown> | null;
    let topics = (config?.practice_topics as string[] | undefined) ?? [];

    // If topics not in config, look them up directly from the assignments table.
    // This is robust against any test-configuration storage issues.
    if (topics.length === 0) {
      const assignId = config?.assignment_id as string | undefined;
      const { data: asgn } = await (
        assignId
          ? supabase.from("assignments").select("categories").eq("id", assignId).maybeSingle()
          : supabase.from("assignments").select("categories").eq("test_id", test.id).maybeSingle()
      );
      topics = (asgn as { categories: string[] | null } | null)?.categories ?? [];
    }

    practiceTopicsRef.current = topics;
    if (topics.length === 0) return;

    const { data } = await supabase
      .from("all_questions")
      .select("uid")
      .eq("status", "approved")
      .in("sub_category", topics);

    if (!data || (data as unknown[]).length === 0) return;

    const uids = shuffle((data as { uid: string }[]).map(q => q.uid))
      .filter(uid => !answeredIdsRef.current.has(uid) && !masteredIdsRef.current.has(uid));

    practiceQueueRef.current    = uids;
    practiceQueuePosRef.current = 0;
  };

  // ─── Network resilience helpers ─────────────────────────────────────────────

  // Retries all queued saves that failed while offline or during a transient DB error.
  // Stable (useCallback with []) so it can be used safely in event listeners and effects.
  // Syncs pendingCount state so the UI reflects the current queue length.
  const flushPendingSaves = useCallback(async () => {
    if (isFlushingRef.current || pendingSavesRef.current.length === 0) return;
    isFlushingRef.current = true;
    const batch = [...pendingSavesRef.current];
    const results = await Promise.allSettled(
      batch.map(save =>
        supabase.from("questions").upsert(save, { onConflict: "test_id, user_id, id" })
      )
    );
    const failed: PendingSave[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && !r.value.error) {
        localStorage.removeItem(`draft_${batch[i].test_id}_q${batch[i].order_index}`);
      } else {
        failed.push(batch[i]);
      }
    });
    pendingSavesRef.current = failed;
    setPendingCount(failed.length);
    if (failed.length === 0) {
      // All saves confirmed — DB is reachable again
      isDbReachableRef.current = true;
      setIsDbReachable(true);
      setSaveError(null);
    }
    isFlushingRef.current = false;
  }, []);

  // On test init: replay any localStorage drafts left over from a previous session
  // that was interrupted before saves could be flushed (e.g. page closed while offline).
  // Drafts that still fail (DB unreachable at init time) are promoted into pendingSavesRef
  // so they are automatically retried by the periodic flush effect.
  const flushLocalStorageDrafts = async (userId: string) => {
    const prefix = `draft_${testID}_q`;
    const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix));
    if (keys.length === 0) return;
    const stillFailed: PendingSave[] = [];
    await Promise.allSettled(
      keys.map(async key => {
        try {
          const save = JSON.parse(localStorage.getItem(key) ?? "") as PendingSave;
          if (!save || save.user_id !== userId) return;
          const { error } = await supabase
            .from("questions")
            .upsert(save, { onConflict: "test_id, user_id, id" });
          if (!error) {
            localStorage.removeItem(key);
          } else {
            stillFailed.push(save);
          }
        } catch { /* malformed draft — ignore */ }
      })
    );
    if (stillFailed.length > 0) {
      pendingSavesRef.current = [...pendingSavesRef.current, ...stillFailed];
      setPendingCount(pendingSavesRef.current.length);
    }
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
      const topics: string[] = practiceTopicsRef.current.length > 0
        ? practiceTopicsRef.current
        : (config?.practice_topics as string[] ?? []);
      const englishCfg = config?.english as { count?: number } | null | undefined;
      const englishCount = englishCfg?.count ?? Math.floor(test.total_questions / 2);
      // Only topic-filtered tests bypass the English/Math adaptive split.
      // Practice tests with no topics follow the same adaptive structure as mock tests.
      const isPractice = topics.length > 0;
      const isEnglishSlot = !isPractice && questionIndex <= englishCount;

      // ── Adaptive English ─────────────────────────────────────────────────────
      // Passages served atomically; difficulty re-evaluated at every passage boundary.
      if (isEnglishSlot && rcTargetRef.current > 0) {
        while (currentPassagePosRef.current < currentPassageUidsRef.current.length &&
               (answeredIds.has(currentPassageUidsRef.current[currentPassagePosRef.current]) ||
                masteredIdsRef.current.has(currentPassageUidsRef.current[currentPassagePosRef.current]))) {
          currentPassagePosRef.current++;
        }

        const passageHasMore = currentPassagePosRef.current < currentPassageUidsRef.current.length;

        if (passageHasMore) {
          // Mid-passage: always continue
          const uid  = currentPassageUidsRef.current[currentPassagePosRef.current++];
          const next = currentPassagePosRef.current < currentPassageUidsRef.current.length
            ? currentPassageUidsRef.current[currentPassagePosRef.current] : undefined;
          rcServedRef.current++;
          setNavPassageInfo({
            setNum:    passageSetNumRef.current,
            itemPos:   currentPassagePosRef.current,   // post-increment → 1-indexed current position
            itemTotal: currentPassageUidsRef.current.length,
          });
          const q = await fetchByUID(uid, next);
          if (q) return q;

        } else if (rcServedRef.current < rcTargetRef.current) {
          // Passage boundary — select next passage (θ re-evaluated here)
          selectNextRCPassage(); // also increments passageSetNumRef.current
          if (currentPassagePosRef.current < currentPassageUidsRef.current.length) {
            const uid  = currentPassageUidsRef.current[currentPassagePosRef.current++];
            const next = currentPassagePosRef.current < currentPassageUidsRef.current.length
              ? currentPassageUidsRef.current[currentPassagePosRef.current] : undefined;
            rcServedRef.current++;
            setNavPassageInfo({
              setNum:    passageSetNumRef.current,
              itemPos:   currentPassagePosRef.current,   // post-increment → 1-indexed current position
              itemTotal: currentPassageUidsRef.current.length,
            });
            const q = await fetchByUID(uid, next);
            if (q) return q;
          }

        } else {
          // RC quota met — serve grammar
          while (grammarPosRef.current < grammarQueueRef.current.length &&
                 (answeredIds.has(grammarQueueRef.current[grammarPosRef.current]) ||
                  masteredIdsRef.current.has(grammarQueueRef.current[grammarPosRef.current]))) {
            grammarPosRef.current++;
          }
          if (grammarPosRef.current < grammarQueueRef.current.length) {
            const uid  = grammarQueueRef.current[grammarPosRef.current++];
            const next = grammarPosRef.current < grammarQueueRef.current.length
              ? grammarQueueRef.current[grammarPosRef.current] : undefined;
            const q = await fetchByUID(uid, next);
            if (q) return q;
          }
        }
        // Fall through to random if all queues exhausted
      }

      // ── Adaptive math ─────────────────────────────────────────────────────────
      // Groups served atomically; difficulty re-evaluated at every group boundary.
      const isMathSlot = !isPractice && !isEnglishSlot;
      if (isMathSlot && mathGroupsRef.current.length > 0) {
        while (currentMathGroupPosRef.current < currentMathGroupUidsRef.current.length &&
               (answeredIds.has(currentMathGroupUidsRef.current[currentMathGroupPosRef.current]) ||
                masteredIdsRef.current.has(currentMathGroupUidsRef.current[currentMathGroupPosRef.current]))) {
          currentMathGroupPosRef.current++;
        }

        const groupHasMore = currentMathGroupPosRef.current < currentMathGroupUidsRef.current.length;

        if (groupHasMore) {
          // Mid-group: always continue
          const uid  = currentMathGroupUidsRef.current[currentMathGroupPosRef.current++];
          const next = currentMathGroupPosRef.current < currentMathGroupUidsRef.current.length
            ? currentMathGroupUidsRef.current[currentMathGroupPosRef.current] : undefined;
          const q = await fetchByUID(uid, next);
          if (q) return q;
        } else {
          // Group boundary — select next group (θ re-evaluated here)
          selectNextMathGroup();
          if (currentMathGroupPosRef.current < currentMathGroupUidsRef.current.length) {
            const uid  = currentMathGroupUidsRef.current[currentMathGroupPosRef.current++];
            const next = currentMathGroupPosRef.current < currentMathGroupUidsRef.current.length
              ? currentMathGroupUidsRef.current[currentMathGroupPosRef.current] : undefined;
            const q = await fetchByUID(uid, next);
            if (q) return q;
          }
        }
        // Fall through to random if pool exhausted
      }

      // ── Practice queue ────────────────────────────────────────────────────────
      // Pre-built at test start; avoids the 2-step random UID fetch for practice mode.
      if (topics.length > 0 && practiceQueueRef.current.length > 0) {
        while (practiceQueuePosRef.current < practiceQueueRef.current.length &&
               (answeredIds.has(practiceQueueRef.current[practiceQueuePosRef.current]) ||
                masteredIdsRef.current.has(practiceQueueRef.current[practiceQueuePosRef.current]))) {
          practiceQueuePosRef.current++;
        }
        if (practiceQueuePosRef.current < practiceQueueRef.current.length) {
          const uid  = practiceQueueRef.current[practiceQueuePosRef.current++];
          const next = practiceQueuePosRef.current < practiceQueueRef.current.length
            ? practiceQueueRef.current[practiceQueuePosRef.current] : undefined;
          const q = await fetchByUID(uid, next);
          if (q) return q;
        }
        // Fall through to random if practice queue exhausted
      }

      // Random fallback: use ilike for case-insensitive subject matching so questions
      // stored as "Math" or "English" (any case) are still correctly filtered.
      const expectedSubject = isEnglishSlot ? "english" : "math";
      let uidQuery = supabase.from("all_questions").select("uid").eq("status", "approved");
      if (topics.length > 0) {
        uidQuery = uidQuery.in("sub_category", topics);
      } else if (!isPractice) {
        // Mock/Diagnostic tests filter by subject slot; practice tests serve any subject
        uidQuery = uidQuery.ilike("subject", expectedSubject);
      }
      const { data: uidPool } = await uidQuery;

      const allUids = (uidPool ?? []).map((q: { uid: string }) => q.uid);
      const available = allUids.filter(uid => !answeredIds.has(uid) && !masteredIdsRef.current.has(uid));
      // Graceful fallback: if every question in this subject/topic has been mastered,
      // allow already-mastered ones so the test doesn't stall (prefer wrong answers still).
      const finalAvailable = available.length > 0
        ? available
        : allUids.filter(uid => !answeredIds.has(uid));

      if (finalAvailable.length === 0) return null;

      const uid = finalAvailable[Math.floor(Math.random() * finalAvailable.length)];
      const { data: qData, error } = await supabase
        .from("all_questions")
        .select("uid, text, answer, type, choice_1, choice_2, choice_3, choice_4, extra_data, subject, sub_category, difficulty")
        .eq("uid", uid)
        .single();

      if (error || !qData) { console.error("Question fetch error:", error); return null; }

      // Hard subject guard: never let a question from the wrong section through,
      // even if DB data has incorrect subject values.
      const returnedSubject = ((qData as Record<string, string>).subject ?? "").toLowerCase();
      if (!isPractice && topics.length === 0 && returnedSubject !== expectedSubject) {
        console.warn(`Subject mismatch: expected ${expectedSubject}, got ${returnedSubject} for uid ${(qData as Record<string, string>).uid}`);
        return null;
      }

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
  // Throws on DB error so the caller can surface a retry prompt rather than
  // silently restarting the student from Q1.
  const getLastAnsweredIndex = async (): Promise<number> => {
    if (!user) return 0;
    const { data, error } = await supabase
      .from("questions")
      .select("order_index")
      .eq("test_id", testID)
      .eq("user_id", user.id)
      .order("order_index", { ascending: false })
      .limit(1);
    if (error) throw error;
    return data?.[0]?.order_index ?? 0;
  };

  const initAnsweredIds = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("questions")
      .select("id")
      .eq("test_id", testID)
      .eq("user_id", user.id);
    if (error) throw error;
    answeredIdsRef.current = new Set((data ?? []).map((q: { id: string }) => q.id));
  };

  // Fetches every question UID the student has answered correctly across ALL past sessions.
  // Runs in parallel at init (no added latency); results are used to exclude mastered
  // questions from all pools/queues so students never see them again.
  const initMasteredIds = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("questions")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_correct", true);
    masteredIdsRef.current = new Set((data ?? []).map((q: { id: string }) => q.id));
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
      setChosenAnswer("");
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
    // Score update is the critical operation — always awaited.
    await supabase.from("tests").update({ score: pct }).eq("id", testID).is("score", null);
    // Clear elapsed timer — fire-and-forget so a missing column never blocks the score write.
    supabase.from("tests").update({ time_elapsed: null }).eq("id", testID);
    // Mark any linked assignment as completed
    await supabase.from("assignments").update({ status: "completed" }).eq("test_id", testID).eq("status", "pending");
  };

  // Submit the current answer and advance to the next question.
  const handleSubmit = async () => {
    if (!user || !questionData || submitting) return;
    setSubmitting(true);

    const is_correct = checkAnswer(
      chosenAnswer,
      questionData.answer ?? "",
      questionData.type ?? "mcq"
    );
    const time_spent = Math.round((Date.now() - questionStartTimeRef.current) / 1000);

    // ── Synchronous bookkeeping BEFORE any await ───────────────────────────────
    // answeredIdsRef and adaptive counters must be updated before getQuestion runs
    // so the queue skip logic and passage/group selection see the latest state.
    answeredIdsRef.current.add(questionData.uid);
    const subj   = questionData.subject ?? "";
    const subCat = questionData.sub_category ?? "";
    if (subj === "english" && !GRAMMAR_SUBCATEGORIES.includes(subCat)) {
      rcAttemptedRef.current++;
      if (is_correct) rcCorrectRef.current++;
    } else if (subj === "math") {
      mathAttemptedRef.current++;
      if (is_correct) mathCorrectRef.current++;
    }

    // Clear answer immediately — gives instant visual feedback on click
    setChosenAnswer("");
    setNullSubmission(false);

    // ── Last question: save then complete (must be sequential) ─────────────────
    if (currentTest && Number(currentTest.total_questions) === Number(currentQuestion)) {
      const lastDraftPayload: PendingSave = { id: questionData.uid, test_id: testID!, user_id: user.id, student_answer: chosenAnswer, is_correct, time_spent, order_index: currentQuestion };
      const lastDraftKey = `draft_${testID}_q${currentQuestion}`;
      localStorage.setItem(lastDraftKey, JSON.stringify(lastDraftPayload));

      const { error: lastError } = await supabase.from("questions").upsert(
        lastDraftPayload,
        { onConflict: "test_id, user_id, id" }
      );
      if (lastError) {
        // Last answer failed — queue it so the periodic retry can save it, then block.
        pendingSavesRef.current.push(lastDraftPayload);
        setPendingCount(pendingSavesRef.current.length);
        setSaveError("Your last answer couldn't be saved. Please check your connection and tap Finish again.");
        setSubmitting(false);
        return;
      }
      localStorage.removeItem(lastDraftKey);

      // Flush every answer that was queued earlier before calculating score.
      // If anything is still unsaved, block navigation — completing with missing answers
      // would produce a wrong score and the student would have no way to know.
      await flushPendingSaves();
      if (pendingSavesRef.current.length > 0) {
        setSaveError(`${pendingSavesRef.current.length} answer${pendingSavesRef.current.length > 1 ? "s" : ""} couldn't be saved yet. Your progress is safe — tap Finish again once the connection restores.`);
        setSubmitting(false);
        return;
      }

      setSaveError(null);
      localStorage.removeItem(`timerRemaining_${testID}`);
      await markTestComplete();
      navigate(`/results/${testID}`);
      return;
    }

    const nextIndex = currentQuestion + 1;

    // ── Save draft to localStorage before attempting DB write ─────────────────
    // This is a safety net: if the page is closed while offline before the in-memory
    // queue can be flushed, flushLocalStorageDrafts() replays these on next load.
    const draftKey = `draft_${testID}_q${currentQuestion}`;
    const draftPayload: PendingSave = { id: questionData.uid, test_id: testID!, user_id: user.id, student_answer: chosenAnswer, is_correct, time_spent, order_index: currentQuestion };
    localStorage.setItem(draftKey, JSON.stringify(draftPayload));

    // ── Save + fetch in parallel — main perf improvement ──────────────────────
    // The DB write and the next question fetch are independent; running them
    // together cuts perceived latency roughly in half.
    const [upsertResult, nextQuestion] = await Promise.all([
      supabase.from("questions").upsert(draftPayload, { onConflict: "test_id, user_id, id" }),
      getQuestion(currentTest, nextIndex),
    ]);

    if (upsertResult.error) {
      // DB or network failure: queue for automatic retry and pause the test.
      // The draft in localStorage is the last-resort backup if the page closes before reconnect.
      pendingSavesRef.current.push(draftPayload);
      setPendingCount(pendingSavesRef.current.length);
      isDbReachableRef.current = false;
      setIsDbReachable(false);
      console.warn("Answer queued for retry:", draftPayload.order_index, upsertResult.error.message);
    } else {
      localStorage.removeItem(draftKey);
    }

    // ── Diagnostic: scan forward if a question slot is missing ────────────────
    let finalQuestion: Record<string, string> | null = nextQuestion;
    let finalIndex = nextIndex;
    if (!finalQuestion && currentTest.test_name === "Diagnostic Test" && nextIndex < Number(currentTest.total_questions)) {
      let skipIdx = nextIndex + 1;
      while (skipIdx <= Number(currentTest.total_questions) && !finalQuestion) {
        finalQuestion = await getQuestion(currentTest, skipIdx);
        if (!finalQuestion) skipIdx++;
      }
      if (finalQuestion) finalIndex = skipIdx;
    }

    if (!finalQuestion) {
      // If the upsert also failed in this batch, or answers are queued from earlier
      // questions, the null return from getQuestion is almost certainly a DB connectivity
      // failure — NOT a genuine end of the test.  Navigating to results with incomplete
      // data would produce a wrong score and a confusing experience.
      if (upsertResult.error || pendingSavesRef.current.length > 0) {
        const capturedTest = currentTest;
        const capturedIndex = finalIndex;
        pendingQuestionRetryRef.current = async () => {
          const q = await getQuestion(capturedTest, capturedIndex);
          if (q) {
            setLatestQuestion(capturedIndex);
            setCurrentQuestion(capturedIndex);
            const subj = (q.subject ?? "").toLowerCase();
            currentSubjectRef.current = subj;
            setSubmitting(false);
          }
        };
        setSaveError("Server connection lost — test paused. Your progress is safe. Reconnecting…");
        setSubmitting(false);
        return;
      }
      // DB is healthy and there genuinely are no more questions — complete the test.
      localStorage.removeItem(`timerRemaining_${testID}`);
      await markTestComplete();
      navigate(`/results/${testID}`);
      return;
    }

    setLatestQuestion(finalIndex);
    setCurrentQuestion(finalIndex);

    // Track the start of new passage sets and math groups to gate back-navigation
    if (currentPassagePosRef.current === 1 || currentMathGroupPosRef.current === 1) {
      currentSetStartRef.current = finalIndex;
    }

    const prevSubject = currentSubjectRef.current;
    const nextSubject = (finalQuestion.subject ?? "").toLowerCase();
    currentSubjectRef.current = nextSubject;
    if (prevSubject === "english" && nextSubject === "math") setShowSectionBreak(true);

    setSubmitting(false);
  };

  // Clicking the right arrow either submits (on active question) or advances review.
  const handleForward = async () => {
    if (submitting) return;
    if (isReadOnly) {
      // Within-set review: save the (possibly changed) answer before moving forward
      if (isEditableReview && questionData && user) {
        const answerToSave = chosenAnswer || previousAnswer;
        const is_correct = checkAnswer(answerToSave, questionData.answer ?? "", questionData.type ?? "mcq");
        const time_spent = Math.round((Date.now() - questionStartTimeRef.current) / 1000);
        supabase.from("questions").upsert(
          { id: questionData.uid, test_id: testID!, user_id: user.id, student_answer: answerToSave, is_correct, time_spent, order_index: currentQuestion },
          { onConflict: "test_id, user_id, id" }
        ).then(({ error }) => { if (error) console.warn("within-set answer re-save failed:", error); });
      }
      const nextIndex = currentQuestion + 1;
      if (nextIndex < latestQuestion) {
        await loadQuestionAtIndex(nextIndex);
      } else {
        // Return to the active unanswered question
        setCurrentQuestion(latestQuestion);
        setQuestionData(activeQuestionData);
        setPreviousAnswer("");
        setChosenAnswer("");
        questionStartTimeRef.current = Date.now();
      }
    } else {
      // Graphing and number-line questions always have an answer (set on mount)
      const alwaysHasAnswer = ["linear_graphing", "number_line_click"].includes(questionData?.type ?? "");
      if (!chosenAnswer && !alwaysHasAnswer) {
        setNullSubmission(true);
        return;
      }
      await handleSubmit();
    }
  };

  // Clicking the left arrow — only reachable within the current active set.
  const handleBack = async () => {
    if (currentQuestion <= currentSetStartRef.current) return;
    // If editing a within-set reviewed question, save the (possibly changed) answer
    if (isEditableReview && questionData && user) {
      const answerToSave = chosenAnswer || previousAnswer;
      const is_correct = checkAnswer(answerToSave, questionData.answer ?? "", questionData.type ?? "mcq");
      const time_spent = Math.round((Date.now() - questionStartTimeRef.current) / 1000);
      supabase.from("questions").upsert(
        { id: questionData.uid, test_id: testID!, user_id: user.id, student_answer: answerToSave, is_correct, time_spent, order_index: currentQuestion },
        { onConflict: "test_id, user_id, id" }
      ).then(({ error }) => { if (error) console.warn("within-set answer re-save failed:", error); });
    }
    // Save the active question data before entering review mode
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
    if (error) {
      console.error("Flag submission failed:", error);
      setReportError(true);
      return;
    }
    setReportError(false);
    setReportDone(true);
    setTimeout(() => {
      setShowReportModal(false);
      setReportDone(false);
      setReportDesc("");
      setReportReason("wrong_answer_key");
    }, 1800);
  }

  // ─── Effects ─────────────────────────────────────────────────────────────────

  // Initialize once when the user context is ready
  useEffect(() => {
    if (!user || hasInitialized.current) return;
    hasInitialized.current = true;

    const init = async () => {
      // Replay any answers that were saved to localStorage during a previous offline session
      // before fetching lastAnswered — so the DB is current before we compute startIndex.
      await flushLocalStorageDrafts(user.id);

      let test: Test | null;
      let lastAnswered: number;
      try {
        const results = await Promise.all([
          getCurrenTest(),
          getLastAnsweredIndex(),
          initAnsweredIds(),
          initMasteredIds(),
        ]);
        test = results[0];
        lastAnswered = results[1];
      } catch (e) {
        console.error("Failed to load test progress:", e);
        setLoadError(true);
        return;
      }
      const startIndex = lastAnswered + 1;

      // If the test was already fully completed, go home
      if (test && lastAnswered >= test.total_questions) {
        navigate("/home");
        return;
      }

      // Build all question pools — practice queue first so adaptive inits can see resolved topics
      if (test) {
        await initPracticeQueue(test);
        await Promise.all([initEnglishAdaptive(test), initMathAdaptive(test)]);
      }

      currentSetStartRef.current = startIndex;
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
        if (lastAnswered === 0 && test?.test_name !== "Diagnostic Test") {
          setShowTestRules(true);
        }
        setTestReady(true);
      }
    };

    init();
  }, [user]);

  // Fetch media whenever the active question changes.
  // If media was already applied synchronously from the pre-fetch cache (cache hit),
  // skip the async DB fetch — mediaSetForRef marks this case.
  // A cancel flag prevents a slow previous fetch from overwriting fresher media.
  useEffect(() => {
    if (!questionData?.uid) { setMediaItems([]); return; }

    // Cache hit path: media was already set synchronously in fetchByUID — skip async fetch
    if (mediaSetForRef.current === questionData.uid) {
      mediaSetForRef.current = null;
      return;
    }

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
    if (!testReady || showTestRules || !currentTest || currentTest.duration === 0) return;

    const storageKey = `timerRemaining_${testID}`;
    const stored = localStorage.getItem(storageKey);
    const durationSeconds = currentTest.duration * 60;
    // localStorage is the primary source (same device, updated every second).
    // Fall back to DB time_elapsed for cross-device resume (new device / cleared browser).
    let remaining: number;
    if (stored) {
      remaining = parseInt(stored, 10);
    } else if (currentTest.time_elapsed != null && currentTest.time_elapsed > 0) {
      remaining = Math.max(0, durationSeconds - currentTest.time_elapsed);
    } else {
      remaining = durationSeconds;
    }

    if (remaining <= 0) {
      localStorage.removeItem(storageKey);
      navigate("/home");
      return;
    }

    setTimeRemaining(remaining);

    timerRef.current = setInterval(() => {
      // Pause when offline or when the DB is unreachable — both refs avoid stale closures.
      if (!isOnlineRef.current || !isDbReachableRef.current) return;
      remaining -= 1;
      localStorage.setItem(storageKey, remaining.toString());
      setTimeRemaining(remaining);
      // Persist elapsed time to DB every 60 s so a new device can resume with the correct timer.
      if (remaining % 60 === 0 && remaining > 0) {
        supabase.from("tests").update({ time_elapsed: durationSeconds - remaining }).eq("id", testID);
      }
      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [testReady, showTestRules]);

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

  // Online/offline detection: updates isOnlineRef (used inside timer tick) and
  // isOnline state (drives banner + button disabled). On reconnect, immediately
  // retries any answers that were queued while offline.
  useEffect(() => {
    const handleOffline = () => {
      isOnlineRef.current = false;
      setIsOnline(false);
    };
    const handleOnline = () => {
      isOnlineRef.current = true;
      setIsOnline(true);
      flushPendingSaves();
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online",  handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online",  handleOnline);
    };
  }, [flushPendingSaves]);

  // Periodic retry: when answers are queued (pendingCount > 0), retry every 10 seconds.
  // This handles DB-down-while-online scenarios — not just network offline events.
  // Stops automatically once the queue drains (pendingCount returns to 0).
  useEffect(() => {
    if (pendingCount === 0) return;
    const id = setInterval(flushPendingSaves, 10_000);
    return () => clearInterval(id);
  }, [pendingCount, flushPendingSaves]);

  // DB recovery ping — runs every 5 s when the DB is marked unreachable.
  // Handles the case where pendingCount is 0 but a question fetch failed (e.g.
  // the upsert happened to succeed but the parallel question fetch did not).
  // On recovery: marks DB reachable, flushes any queued saves, and executes the
  // stored question-fetch retry so the test resumes automatically.
  useEffect(() => {
    if (isDbReachable || !isOnline) return;
    const id = setInterval(async () => {
      const { error } = await supabase
        .from("tests").select("id").eq("id", testID).maybeSingle();
      if (error) return; // still down
      // DB is back
      isDbReachableRef.current = true;
      setIsDbReachable(true);
      setSaveError(null);
      await flushPendingSaves();
      if (pendingQuestionRetryRef.current) {
        const retry = pendingQuestionRetryRef.current;
        pendingQuestionRetryRef.current = null;
        await retry();
      }
    }, 5_000);
    return () => clearInterval(id);
  }, [isDbReachable, isOnline, flushPendingSaves, testID]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col w-full min-h-screen bg-slate-50">
      {/* Pause banner — shown when network is down OR when DB is unreachable.
          Both cases stop the timer and disable Submit. The message tells the student
          their progress is safe so they don't panic and close the tab. */}
      {(!isOnline || !isDbReachable) && (
        <div className="fixed inset-x-0 top-0 z-60 flex items-center justify-center gap-2.5 bg-amber-500 text-white text-sm font-semibold py-3 px-4 shadow-lg">
          <svg className="w-4 h-4 shrink-0 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M4.929 4.929l14.142 14.142" />
          </svg>
          {!isOnline
            ? "No internet connection — your test and timer are paused. Reconnect to continue."
            : "Server connection lost — your test and timer are paused. Your progress is safe. Reconnecting…"}
        </div>
      )}

      {/* Init error overlay — shown when progress load fails (DB error, auth issue, etc.).
          Prevents silent restart from Q1 by making the failure visible and actionable. */}
      {loadError && (
        <div className="fixed inset-0 bg-slate-50 flex flex-col items-center justify-center z-50 p-8 gap-5">
          <div className="w-14 h-14 rounded-full bg-rose-100 flex items-center justify-center">
            <svg className="w-7 h-7 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div className="text-center max-w-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Couldn't load your progress</h2>
            <p className="text-sm text-slate-500">There was a connection problem retrieving your answers. Your progress is safe — please refresh the page to try again.</p>
          </div>
          <button
            type="button"
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors"
            onClick={() => window.location.reload()}
          >
            Refresh page
          </button>
        </div>
      )}

      {/* Section transition overlay */}
      {showSectionBreak && (
        <div className="fixed inset-0 bg-slate-50 flex flex-col items-center justify-center z-50 p-4 sm:p-8 overflow-y-auto">
          <div className="max-w-lg w-full flex flex-col gap-4 sm:gap-5 py-4">
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

      {/* Pre-test rules overlay — shown once for new (not resumed) non-diagnostic tests */}
      {testReady && showTestRules && (
        <div className="fixed inset-0 bg-slate-50 flex flex-col items-center justify-center z-50 p-4 sm:p-8 overflow-y-auto">
          <div className="max-w-lg w-full flex flex-col gap-4 sm:gap-5 py-4">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-1">Before You Begin</h1>
              <p className="text-slate-500 text-sm">{currentTest?.test_name}</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col gap-3">
              <div className="flex items-start gap-3 p-3.5 bg-rose-50 border border-rose-200 rounded-xl">
                <svg className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                <p className="text-sm text-rose-800 font-medium">You are not allowed to skip questions.</p>
              </div>
              <div className="flex items-start gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
                <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-9.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                </svg>
                <p className="text-sm text-amber-800 font-medium">
                  If a question has an issue, use the <span className="font-bold">Flag</span> button at the bottom-right to report it, then fill in any answer to move on.
                </p>
              </div>
              <div className="flex items-start gap-3 p-3.5 bg-teal-50 border border-teal-200 rounded-xl">
                <svg className="w-5 h-5 text-teal-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                </svg>
                <div className="text-sm text-teal-800">
                  <span className="font-bold">Mixed numbers:</span> A number like <span className="font-semibold">1 and 1/2</span> or <span className="font-semibold">3 and 4/5</span> means a whole number combined with a fraction — so "2 and 3/4" is the same as 2¾. The word "and" separates the whole part from the fraction part.
                </div>
              </div>
              <div className="flex items-start gap-3 p-3.5 bg-violet-50 border border-violet-200 rounded-xl">
                <svg className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-violet-800">
                  <span className="font-bold">Repeating decimals:</span> A decimal written as <span className="font-semibold">0.333...</span> or <span className="font-semibold">0.142857...</span> means the digits after the "..." keep repeating in the same pattern forever — the three dots tell you the pattern continues without end.
                </div>
              </div>
            </div>

            <button
              type="button"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold transition-colors"
              onClick={() => setShowTestRules(false)}
            >
              Begin Test
            </button>
          </div>
        </div>
      )}

      {/* Header + ELA toolbar (sticky together as one unit) */}
      <div className="bg-white border-b border-slate-100 shadow-sm shrink-0 sticky top-0 z-10">
      <div className="px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-between">
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

        {/* Center: question counter — context-aware */}
        <div className="flex flex-col items-center shrink-0 px-2 sm:px-4">
          {(() => {
            if (!currentTest) return (
              <>
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-400 leading-tight">Question</span>
                <span className="text-sm font-bold text-slate-800 tabular-nums">—</span>
              </>
            );
            const cfg             = currentTest.configuration as Record<string, unknown> | null;
            const isDiagnostic    = currentTest.test_name === "Diagnostic Test";
            const isTopicPractice = Boolean(cfg?.practice_topics);
            // Diagnostic and topic-filtered practice: plain "Question X / N"
            if (isDiagnostic || isTopicPractice) return (
              <>
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-400 leading-tight">Question</span>
                <span className="text-sm font-bold text-slate-800 tabular-nums">
                  {currentQuestion} / {currentTest.total_questions}
                </span>
              </>
            );
            // Full mock test — section-aware display
            const englishCfg   = cfg?.english as { count?: number } | null;
            const englishCount = englishCfg?.count ?? Math.floor(currentTest.total_questions / 2);
            const subject      = questionData?.subject ?? "";
            if (subject === "english") {
              // Active passage question: show passage set + item within set
              if (!isReadOnly && isPassageQuestion && navPassageInfo.setNum > 0) return (
                <>
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-400 leading-tight">
                    Passage Set {navPassageInfo.setNum}
                  </span>
                  <span className="text-sm font-bold text-slate-800 tabular-nums">
                    Item {navPassageInfo.itemPos} of {navPassageInfo.itemTotal}
                  </span>
                </>
              );
              // Standalone grammar items or review mode: item X of section total
              return (
                <>
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-400 leading-tight">ELA</span>
                  <span className="text-sm font-bold text-slate-800 tabular-nums">
                    Item {currentQuestion} of {englishCount}
                  </span>
                </>
              );
            }
            if (subject === "math") {
              const mathIndex = currentQuestion - englishCount;
              const mathTotal = currentTest.total_questions - englishCount;
              return (
                <>
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-400 leading-tight">Math</span>
                  <span className="text-sm font-bold text-slate-800 tabular-nums">
                    Item {mathIndex} of {mathTotal}
                  </span>
                </>
              );
            }
            // Subject not yet loaded
            return (
              <>
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-400 leading-tight">Question</span>
                <span className="text-sm font-bold text-slate-800 tabular-nums">
                  {currentQuestion} / {currentTest.total_questions}
                </span>
              </>
            );
          })()}
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
      </div>{/* end main header row */}

      {/* Annotation toolbar — shown for all subjects */}
      {questionData && (
        <div className="px-3 sm:px-6 py-1.5 border-t border-slate-100 bg-slate-50/80 overflow-x-auto">
          <ELAToolbar
            tools={elaTools}
            questionUid={questionData.uid ?? ""}
          />
        </div>
      )}
      </div>{/* end sticky header + toolbar wrapper */}

      {/* Pending-saves indicator — fixed bottom-left, mirrors Flag button.
          Visible whenever answers are queued and not yet confirmed by the DB.
          Disappears automatically once all answers have been saved. */}
      {pendingCount > 0 && (
        <div className="fixed bottom-6 left-6 z-20 flex items-center gap-2 bg-amber-50 border border-amber-300 shadow-md rounded-full px-3.5 py-2 text-xs font-medium text-amber-800">
          <svg className="w-3.5 h-3.5 animate-spin text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {pendingCount} answer{pendingCount > 1 ? "s" : ""} not saved — retrying…
        </div>
      )}

      {/* Flag button — fixed bottom-right, only when a live question is shown */}
      {questionData && !isReadOnly && (
        <button
          type="button"
          onClick={() => { setReportError(false); setShowReportModal(true); }}
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-4 sm:p-6 flex flex-col gap-4">
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

                {reportError && (
                  <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-center">
                    Failed to submit — please try again.
                  </p>
                )}
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

      {/* Question area — stacks vertically on mobile, side-by-side on large screens */}
      <div className="relative flex flex-col lg:flex-row items-start justify-center py-4 sm:py-8 px-3 sm:px-6 flex-1 gap-4">
        {questionData ? (
          <>
            {/* Left panel — full width on mobile, 45% on large screens */}
            {displayMedia.length > 0 && (
              // Outer wrapper: sized/sticky/relative — line mask lives here so it stays over the visible area
              // max-h on mobile/tablet caps the passage so the question stays visible without excessive scrolling
              <div className="relative w-full max-h-[45vh] sm:max-h-[50vh] lg:max-h-none lg:w-[45%] lg:min-w-72 lg:max-w-[65%] lg:h-[calc(100vh-8rem)] lg:min-h-48 lg:self-start lg:sticky lg:top-20 rounded-2xl overflow-hidden">
                {/* Inner: scrollable content */}
                <div
                  ref={passageContainerRef}
                  className="relative flex flex-col h-full lg:resize overflow-auto bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-6"
                  onMouseUp={() => elaTools.activeTool === "highlight" && captureHighlight(passageContainerRef.current, `p-${questionData.uid}`)}
                >
                  <MediaDisplay mediaItems={displayMedia} />
                  {/* Highlight overlays for passage */}
                  {(elaTools.highlights.get(`p-${questionData.uid}`) ?? []).map(h => (
                    <div key={h.id}
                      className="absolute pointer-events-none rounded-sm"
                      style={{ top: h.top, left: h.left, width: h.width, height: h.height, background: "rgba(251,191,36,0.35)", mixBlendMode: "multiply" } as React.CSSProperties}
                    />
                  ))}
                  {/* Pencil canvas inside scrollable — strokes correctly track scroll position */}
                  <ELAPencilCanvas
                    active={elaTools.activeTool === "pencil"}
                    strokes={elaTools.getPencilState(questionData.uid ?? "").strokes}
                    onAddStroke={stroke => elaTools.addStroke(questionData.uid ?? "", stroke)}
                  />
                </div>
                {/* Line Reader outside scrollable — stays fixed over the visible panel area while content scrolls */}
                {elaTools.activeTool === "linereader" && (
                  <ELALineMask maskY={elaTools.lineMaskY} onMove={elaTools.setLineMaskY} />
                )}
              </div>
            )}

            {/* Right panel — full width on mobile, flexible on large screens */}
            <div className={`relative bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-8 flex flex-col gap-5 w-full ${displayMedia.length > 0 ? "lg:flex-1" : "lg:max-w-3xl lg:mx-auto"}`}>
              {/* Pencil canvas and Line Reader on right panel only when there is no passage/media panel */}
              {displayMedia.length === 0 && questionData && (
                <ELAPencilCanvas
                  active={elaTools.activeTool === "pencil"}
                  strokes={elaTools.getPencilState(questionData.uid ?? "").strokes}
                  onAddStroke={stroke => elaTools.addStroke(questionData.uid ?? "", stroke)}
                />
              )}
              {displayMedia.length === 0 && elaTools.activeTool === "linereader" && (
                <ELALineMask maskY={elaTools.lineMaskY} onMove={elaTools.setLineMaskY} />
              )}

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

              {/* Question text — hidden for types that render their own text inline */}
              {!["inline-dropdown", "drag_fill_single", "drag_fill_multiple"].includes(questionData.type) && (() => {
                const extra = ((questionData as Record<string, unknown>).extra_data as Record<string, unknown> | null) ?? {};
                const vars = Array.isArray(extra.variables) ? extra.variables as string[] : [];
                return (
                  <div
                    ref={questionTextContainerRef}
                    className="relative text-base leading-relaxed text-slate-800"
                    onMouseUp={() => elaTools.activeTool === "highlight" && captureHighlight(questionTextContainerRef.current, `q-${questionData.uid}`)}
                  >
                    {parseFormattedText(questionData.text ?? "", "", vars)}
                    {/* Highlight overlays for question text */}
                    {(elaTools.highlights.get(`q-${questionData.uid}`) ?? []).map(h => (
                      <div key={h.id}
                        className="absolute pointer-events-none rounded-sm"
                        style={{ top: h.top, left: h.left, width: h.width, height: h.height, background: "rgba(251,191,36,0.35)", mixBlendMode: "multiply" } as React.CSSProperties}
                      />
                    ))}
                  </div>
                );
              })()}

              {/* Answer input — key forces full remount on question change */}
              {(() => {
                const qd = questionData as Record<string, unknown>;
                const extra = (qd.extra_data as Record<string, unknown> | null) ?? {};
                const baseOptions = [
                  questionData.choice_1,
                  questionData.choice_2,
                  questionData.choice_3,
                  questionData.choice_4,
                ];
                if (questionData.type === "multi-select" || questionData.type === "drag_fill_multiple") {
                  if (extra.choice_5) baseOptions.push(extra.choice_5 as string);
                  if (extra.choice_6) baseOptions.push(extra.choice_6 as string);
                }
                return (
                  <QuestionRenderer
                    key={currentQuestion}
                    chosenAnswer={setChosenAnswer}
                    type={questionData.type as "mcq" | "grid-in" | "linear_graphing" | "multi-select" | "expression" | "inline-dropdown" | "number_line_click" | "table_row_radio" | "drag_fill_single" | "drag_fill_multiple" | "drag_to_bin" | "drag_to_categorize" | "in_passage_sentence_select" | "inline_text_span_click"}
                    uid={questionData.uid}
                    options={baseOptions}
                    answer={questionData.answer}
                    isReadOnly={isReadOnly && !isEditableReview}
                    previousAnswer={previousAnswer}
                    choiceImages={choiceImages}
                    selectCount={typeof extra.select_count === "number" ? extra.select_count : 1}
                    variables={Array.isArray(extra.variables) ? extra.variables as string[] : []}
                    eliminateMode={elaTools.activeTool === "eliminate"}
                    eliminatedChoices={elaTools.eliminations.get(questionData.uid ?? "") ?? new Set()}
                    onEliminate={letter => elaTools.toggleElimination(questionData.uid ?? "", letter)}
                    text={questionData.text ?? ""}
                    nlMin={typeof extra.min === "number" ? extra.min : -10}
                    nlMax={typeof extra.max === "number" ? extra.max : 10}
                    nlStep={typeof extra.step === "number" ? extra.step : 1}
                    trColHeaders={Array.isArray(extra.col_headers) ? extra.col_headers as string[] : []}
                    trRows={Array.isArray(extra.rows) ? extra.rows as string[] : []}
                    dfItems={Array.isArray(extra.items) ? extra.items as string[] : []}
                    dfBins={Array.isArray(extra.bins) ? extra.bins as string[] : []}
                    pssSentences={Array.isArray(extra.sentences) ? extra.sentences as string[] : []}
                    spanPassage={typeof extra.passage === "string" ? extra.passage : ""}
                  />
                );
              })()}

              {/* Navigation row — back left, submit right */}
              <div className="flex flex-col gap-2 pt-1">
                {nullSubmission && (
                  <p className="text-xs sm:text-sm text-rose-600 font-medium animate-bounce text-center">
                    Select an answer before continuing.
                  </p>
                )}
                {saveError && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5">
                    <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    <p className="text-xs text-amber-800 font-medium">{saveError}</p>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div>
                    {showBackButton && (
                      <button
                        type="button"
                        aria-label="Previous question"
                        onClick={handleBack}
                        className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 text-xs sm:text-sm font-medium transition-colors"
                      >
                        {icons.arrowLeft}
                        Back
                      </button>
                    )}
                  </div>
                  <div>
                  <button
                    type="button"
                    disabled={submitting || !isOnline || !isDbReachable}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed text-white px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-colors flex items-center gap-2"
                    onClick={handleForward}
                  >
                    {submitting ? (
                      <>
                        <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Loading…
                      </>
                    ) : isReadOnly
                      ? currentQuestion + 1 < latestQuestion ? "Next" : "Resume"
                      : currentTest && Number(currentQuestion) === Number(currentTest.total_questions) ? "Finish" : "Submit"}
                  </button>
                </div>
              </div>
              </div>
            </div>
          </>
        ) : (
          <p className="text-slate-400 text-sm mt-16">Loading question…</p>
        )}
      </div>

      {/* ELA Notepad — floating, persists for entire ELA section */}
      <ELANotepad
        open={elaTools.notesOpen}
        notes={elaTools.notes}
        onNotesChange={elaTools.setNotes}
        onClose={elaTools.toggleNotes}
      />
    </div>
  );
}

export default MockTest;
