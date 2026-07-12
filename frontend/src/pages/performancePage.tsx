import { useContext, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer,
} from "recharts";
import type { TooltipProps } from "recharts";
import SideBar from "../components/sideBar";
import { supabase } from "../supabase-client";
import { UserContext } from "../components/userContext";
import { Test } from "../components/types";

// ─── constants ────────────────────────────────────────────────────────────────
// Weights match scoring.ts exactly — easy=1, medium=1.5, hard=2
const DIFF_W: Record<string, number> = { easy: 1, medium: 1.5, hard: 2 };
const SHSAT_SECS = 10_800; // 3 h in seconds

function normDiff(raw: string | null | undefined): string {
  const l = raw?.toLowerCase?.();
  if (l === "easy") return "easy";
  if (l === "hard") return "hard";
  return "medium";
}
function validTime(t: number | null | undefined): number | null {
  return t != null && t >= 3 && t <= 600 ? t : null;
}
function avg(arr: number[]): number | null {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
}
function scoreBand(s: number): { label: string; cls: string } {
  if (s >= 620) return { label: "Top-school competitive",  cls: "text-emerald-600" };
  if (s >= 580) return { label: "Competitive range",       cls: "text-blue-600"    };
  if (s >= 500) return { label: "Approaching competitive", cls: "text-amber-600"   };
  return               { label: "Keep practicing",         cls: "text-rose-600"    };
}

// Maps the recharts line stroke colours (set below) to Tailwind text classes
const LINE_COLOR_CLS: Record<string, string> = {
  "#64748b": "text-slate-600",
  "#3b82f6": "text-blue-600",
  "#8b5cf6": "text-violet-600",
};

// ─── types ────────────────────────────────────────────────────────────────────
interface MergedQ {
  id: string;
  test_id: string;
  is_correct: boolean;
  time_spent: number | null;
  sub_category: string | null;
  subject: string | null;
  difficulty: string | null;
}
interface SubStat {
  name: string; subject: string;
  correct: number; total: number; accuracy: number; avgSecs: number | null;
}
interface SubjectStat {
  correct: number; total: number; accuracy: number; avgSecs: number | null;
}
interface Prediction {
  score: number; accuracyOnly: number; timeFactor: number; avgSecs: number | null;
}
interface Advice {
  type: "error" | "warn" | "info" | "good";
  heading: string; body: string;
}

// ─── score prediction ─────────────────────────────────────────────────────────
function computePrediction(qs: MergedQ[], budgetPerQ: number): Prediction {
  let earnedW = 0, totalW = 0;
  for (const q of qs) {
    const w = DIFF_W[normDiff(q.difficulty)];
    totalW += w;
    if (q.is_correct) earnedW += w;
  }
  const baseAcc = totalW > 0 ? earnedW / totalW : 0;
  const accuracyOnly = Math.round(baseAcc * 500 + 200);

  const times = qs.map(q => validTime(q.time_spent)).filter((t): t is number => t !== null);
  if (times.length < 10) return { score: accuracyOnly, accuracyOnly, timeFactor: 1, avgSecs: null };

  const avgSecs = times.reduce((s, t) => s + t, 0) / times.length;
  const timeFactor = Math.min(1, budgetPerQ / avgSecs);
  return { score: Math.round(baseAcc * timeFactor * 500 + 200), accuracyOnly, timeFactor, avgSecs };
}

// ─── subcategory display name ─────────────────────────────────────────────────
function fmtSub(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/^Organization-/, "Org: ")
    .replace(/^Style-/, "Style: ")
    .replace(/\bEq\b\.?/g, "Eq.")
    .replace(/\band\b/g, "&");
}

// ─── advice ───────────────────────────────────────────────────────────────────
// Keys match DB sub_category values exactly.
const TIPS: Record<string, string> = {
  // English
  Authors_Perspective:
    "Focus on the author's attitude toward the topic. Look for emotionally charged or opinionated words that reveal their stance.",
  Authors_Point_of_View:
    "Identify the narrator type: first person (I/we), second (you), or third limited/omniscient. The POV controls what information is accessible.",
  Authors_Purpose:
    "Ask: is the author informing, persuading, or entertaining? Signal words like 'argue', 'describe', or 'explain' reveal the purpose.",
  Central_Idea:
    "The central idea is the one point every paragraph supports. Summarize the whole passage in a single sentence — that's your central idea.",
  Comma_Usage:
    "Commas join independent clauses with a conjunction, follow introductory phrases, and separate items in a list. Review these three rules.",
  Figurative_Language:
    "Identify the technique first (simile = like/as, metaphor = is/are), then ask what comparison is being made and why.",
  Main_Idea:
    "Read the first and last sentence of each paragraph. The main idea is broader than any single detail and is usually in the topic sentence.",
  "Organization-Concluding_Sentence":
    "A concluding sentence wraps up the paragraph's main point without introducing new ideas — it restates the topic in different words.",
  "Organization-Logical_Placement":
    "Read the sentences before and after the blank. Transition words (however, therefore, also) are direct clues to the correct position.",
  "Organization-Paragraph_Unity":
    "Every sentence must support the topic sentence. Find the one that introduces a different subject — that's what doesn't belong.",
  "Organization-Topic_Sentence":
    "A topic sentence must be general enough to cover all the details in the paragraph. If it's too specific, it's not the topic sentence.",
  "Organization-Transitions":
    "Match the transition to the relationship: 'however/but' = contrast, 'therefore/thus' = cause-effect, 'furthermore' = addition.",
  Plot_Development:
    "Trace conflict → rising action → climax → resolution. Most plot questions ask about cause-and-effect between events.",
  Poetic_Technique:
    "Identify alliteration, repetition, rhyme scheme, and figurative devices. Ask how each technique reinforces mood or meaning.",
  Point_of_View:
    "Separate the narrator's perspective from the author's. First-person narrators can be unreliable — look for signs of bias.",
  Pronoun_Agreement:
    "A pronoun must agree with its antecedent in number. Watch collective nouns (team = singular) and indefinite pronouns (everyone = singular).",
  Sentence_Combining:
    "Choose the option that eliminates redundancy and preserves the original meaning. Avoid options that add extra or change the intent.",
  Sentence_Structure:
    "An independent clause has a subject + verb and can stand alone. A dependent clause cannot. Recognize fragments and run-ons.",
  Setting:
    "Notice descriptive details about time, place, and atmosphere. Consider how the setting shapes character mood and plot events.",
  "Style-Word_Choice":
    "Ask why this specific word over a synonym — consider tone (formal vs. informal), connotation (positive vs. negative), and precision.",
  "Subject-Verb_Agreement":
    "Find the true subject (ignore prepositional phrases) then match the verb. Compound subjects joined by 'and' take plural verbs.",
  Summarization:
    "A summary includes the main idea and key support — use your own words. Cut minor details, examples, and repeated information.",
  Text_Feature:
    "Read captions, headings, and graphs independently, then ask how each feature relates to the main text's argument or narrative.",
  Text_Structure:
    "Identify the pattern: cause-effect, compare-contrast, problem-solution, sequence, or description. Signal words reveal structure.",
  Textual_Evidence:
    "Quote or paraphrase the exact passage section. Line numbers in the question are a direct pointer — re-read that paragraph first.",
  Textual_Evidence_and_Reasoning:
    "Identify the claim, then find the evidence that directly supports it, then explain the logical link between the two.",
  Theme:
    "Theme is a full life-lesson statement, not a one-word topic. Check every answer against the whole passage — the theme must apply broadly.",
  Tone:
    "Track emotion-carrying words throughout the passage. The dominant feeling reveals the overall tone.",
  Verb_Tense:
    "Keep tense consistent unless the time frame changes. Past-perfect (had + past participle) indicates an action before another past event.",
  Vocabulary_in_Context:
    "Cover the word, predict what would make sense in context, then match your prediction to the answer choices.",
  Word_Choice:
    "Consider both denotation (literal meaning) and connotation (implied feeling). Replace the word and see if meaning or tone changes.",

  // Math
  Algebra_and_Equations:
    "Translate word problems into equations first. Isolate the variable one step at a time and verify by substituting your answer back.",
  Algebraic_Expressions:
    "Combine like terms and distribute carefully. Distributing a negative flips all signs — the most common error on this topic.",
  Arithmetic:
    "Review PEMDAS order-of-operations. Practice mental multiplication tables and quick fraction↔decimal conversions.",
  Fraction_Word_Problems:
    "Draw a number line or bar model. Find a common denominator before adding/subtracting; multiply across when multiplying fractions.",
  Geometry:
    "Sketch every figure and label what you know. Key formulas: triangle area = ½bh, circle area = πr², rectangle area = lw.",
  Inequalities:
    "Solve like an equation but flip the inequality sign when multiplying or dividing by a negative number.",
  Inference_and_Implied_Ideas:
    "Work only from the information given. Avoid over-inferring — the correct answer must be directly supported by the text or data.",
  "Linear_Eq._Formula":
    "Slope-intercept: y = mx + b. Slope = (y₂−y₁)/(x₂−x₁). Use two points to build the equation, then verify with a third.",
  Percentage:
    "Part = Percent × Whole. Percent change = (new − old) ÷ old × 100. Discount/tax: multiply original by (1 ± rate).",
  Probability:
    "P(event) = favorable ÷ total outcomes. Independent events: multiply. Mutually exclusive 'or': add.",
  "Rate-Unit_Rate":
    "Set up as a proportion with matching units. Always check units — convert before calculating if they differ.",
  Ratios_and_Proportions:
    "Write ratios as fractions. Cross-multiply to solve proportions. For part-to-part ratios, find the total parts first.",
  Sequence:
    "Identify arithmetic (add/subtract constant) vs. geometric (multiply/divide constant). Write an explicit formula to find any term.",
  Stats_and_Data_Analysis:
    "Mean = sum ÷ count. Median = middle value after sorting. Mode = most frequent. Read chart axis labels before answering.",
};

function getTip(name: string): string {
  if (TIPS[name]) return TIPS[name];
  // Fuzzy fallback: normalize underscores for both sides
  const n = name.toLowerCase().replace(/_/g, " ");
  for (const [k, v] of Object.entries(TIPS)) {
    const kn = k.toLowerCase().replace(/_/g, " ");
    if (n.includes(kn) || kn.includes(n)) return v;
  }
  return `Focused practice on ${fmtSub(name)}, with immediate review of every wrong answer, is the fastest path to improvement.`;
}

function buildAdvice(
  subs: SubStat[], subjects: Record<string, SubjectStat>,
  pred: Prediction, total: number, budgetPerQ: number,
): Advice[] {
  const out: Advice[] = [];
  const budgetRound = Math.round(budgetPerQ);
  const totalQEst = Math.round(SHSAT_SECS / budgetPerQ);
  // pacing
  if (pred.avgSecs !== null) {
    const over = pred.avgSecs - budgetPerQ;
    if (over > budgetPerQ * 0.5)
      out.push({ type: "error", heading: "Pacing is a critical issue",
        body: `You average ${Math.round(pred.avgSecs)}s per question — SHSAT budget is ~${budgetRound}s. At this pace you'd leave ~${Math.round((1 - pred.timeFactor) * totalQEst)} questions unanswered. Make timed drills your top priority.` });
    else if (over > budgetPerQ * 0.1)
      out.push({ type: "warn", heading: "Watch your pacing",
        body: `You average ${Math.round(pred.avgSecs)}s/question (budget ~${budgetRound}s). You'll feel rushed near the end. Set a per-question timer to build the habit.` });
    else if (pred.avgSecs < budgetPerQ * 0.7)
      out.push({ type: "good", heading: "Strong pacing",
        body: `You average ${Math.round(pred.avgSecs)}s/question — well within the ${budgetRound}s budget. You have spare time to review flagged answers.` });

    const slowSubs = subs.filter(s => s.avgSecs !== null && s.avgSecs > budgetPerQ * 1.3 && s.total >= 3)
      .sort((a, b) => (b.avgSecs ?? 0) - (a.avgSecs ?? 0)).slice(0, 2);
    for (const s of slowSubs)
      out.push({ type: "warn", heading: `Slow on: ${fmtSub(s.name)}`,
        body: `~${Math.round(s.avgSecs!)}s per ${fmtSub(s.name)} question (budget ~${budgetRound}s). Build speed with repeated timed drills on this topic.` });
  }
  // accuracy
  const eng = subjects["English"], math = subjects["Math"];
  if (eng && eng.accuracy < 55)
    out.push({ type: "error", heading: "English needs urgent work",
      body: `${eng.accuracy}% accuracy on ${eng.total} questions. Reading Comprehension carries the most weight — start there.` });
  else if (eng && eng.accuracy < 70)
    out.push({ type: "warn", heading: "English has room to grow",
      body: `${eng.accuracy}% accuracy. Revising/Editing questions follow predictable grammar patterns and tend to yield fast gains.` });
  if (math && math.accuracy < 55)
    out.push({ type: "error", heading: "Math needs urgent work",
      body: `${math.accuracy}% on ${math.total} questions. Word Problems and Algebra cover the most questions — start there.` });
  else if (math && math.accuracy < 70)
    out.push({ type: "warn", heading: "Math has room to grow",
      body: `${math.accuracy}% accuracy. Timed drills on Geometry and Data Analysis will recover the most points.` });
  // weak subcategories
  const weak = subs.filter(s => s.total >= 3 && s.accuracy < 65)
    .sort((a, b) => a.accuracy - b.accuracy).slice(0, 3);
  for (const s of weak)
    out.push({ type: s.accuracy < 40 ? "error" : "warn", heading: `Focus area: ${fmtSub(s.name)}`,
      body: `${s.accuracy}% on ${s.total} questions. ${getTip(s.name)}` });
  // strengths
  const strong = subs.filter(s => s.total >= 3 && s.accuracy >= 80)
    .sort((a, b) => b.accuracy - a.accuracy).slice(0, 2);
  if (strong.length)
    out.push({ type: "good", heading: `Strength: ${strong.map(s => fmtSub(s.name)).join(" & ")}`,
      body: `${strong.map(s => `${s.accuracy}% in ${fmtSub(s.name)}`).join(", ")}. Keep these sharp — consistent performance earns reliable points.` });
  if (total < 50)
    out.push({ type: "info", heading: "Answer more questions for sharper insights",
      body: `${total} questions answered so far. At 50+ the prediction and subcategory breakdown become significantly more reliable.` });
  return out;
}

// ─── recharts tooltips ────────────────────────────────────────────────────────
function SHSATTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const score = payload[0].value as number;
  const { testName, date } = payload[0].payload;
  const band = scoreBand(score);
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-xs space-y-0.5">
      <p className="font-semibold text-slate-700">{testName}</p>
      <p className="text-[10px] text-slate-400">{date}</p>
      <p className="text-xl font-extrabold text-slate-900 tabular-nums">{score} <span className="text-sm font-normal text-slate-400">/ 700</span></p>
      <p className={`font-medium ${band.cls}`}>{band.label}</p>
    </div>
  );
}

function AccuracyTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const { testName, date } = payload[0].payload;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-xs space-y-1">
      <p className="font-semibold text-slate-700">{testName}</p>
      <p className="text-[10px] text-slate-400">{date}</p>
      {payload.map(p => p.value != null && (
        <p key={p.name} className={`font-medium ${LINE_COLOR_CLS[p.color as string] ?? "text-slate-700"}`}>
          {p.name}: <span className="tabular-nums">{p.value}%</span>
        </p>
      ))}
    </div>
  );
}

// ─── small sub-components ─────────────────────────────────────────────────────
function Bar({ pct, color }: { pct: number; color: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.style.width = `${Math.max(0, Math.min(100, pct))}%`; }, [pct]);
  return (
    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
      <div ref={ref} className={`h-1.5 rounded-full transition-all duration-700 ${color}`} />
    </div>
  );
}
function TimeTag({ secs, budget }: { secs: number | null; budget: number }) {
  if (secs === null) return null;
  const cls = secs <= budget * 0.8 ? "bg-emerald-50 text-emerald-700"
    : secs <= budget * 1.1 ? "bg-slate-100 text-slate-500"
    : secs <= budget * 1.5 ? "bg-amber-50 text-amber-700"
    : "bg-rose-50 text-rose-700";
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded tabular-nums shrink-0 ${cls}`}>
      {Math.round(secs)}s
    </span>
  );
}
const ASTYLE = {
  error: { card: "border-l-4 border-rose-400 bg-rose-50",       h: "text-rose-700" },
  warn:  { card: "border-l-4 border-amber-400 bg-amber-50",     h: "text-amber-700" },
  info:  { card: "border-l-4 border-blue-400 bg-blue-50",       h: "text-blue-700" },
  good:  { card: "border-l-4 border-emerald-400 bg-emerald-50", h: "text-emerald-700" },
} as const;

// ─── page ─────────────────────────────────────────────────────────────────────
export default function PerformancePage() {
  const user     = useContext(UserContext);
  const navigate = useNavigate();
  const { studentId } = useParams<{ studentId?: string }>();

  // targetId: the student whose data we're viewing
  const targetId = studentId ?? user?.id ?? "";
  const isViewing = !!studentId; // admin/parent viewing a student

  const [studentName, setStudentName] = useState<string | null>(null);
  const [questions,   setQuestions]   = useState<MergedQ[] | null>(null);
  const [allTests,    setAllTests]    = useState<Test[]>([]);

  // Authorization guard: students can only view their own page
  useEffect(() => {
    if (!user) return;
    if (studentId && user.role === "student" && studentId !== user.id) {
      navigate("/performance", { replace: true });
    }
  }, [user, studentId, navigate]);

  // Fetch student name when viewing someone else's page
  useEffect(() => {
    if (!studentId) { setStudentName(null); return; }
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", studentId)
        .single();
      if (data) setStudentName(`${data.first_name} ${data.last_name}`);
    })();
  }, [studentId]);

  // When admin/parent views a student: call edge function (bypasses RLS)
  useEffect(() => {
    if (!isViewing || !targetId || !user) return;
    setQuestions(null);
    setAllTests([]);
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setQuestions([]); return; }
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-student-performance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ student_id: targetId }),
        }
      );
      if (!res.ok) { setQuestions([]); return; }
      const body = await res.json();
      setQuestions(body.questions ?? []);
      setAllTests((body.tests ?? []) as Test[]);
    })();
  }, [isViewing, targetId, user]);

  // When student views their own page: direct Supabase queries (allowed by RLS)
  useEffect(() => {
    if (isViewing || !targetId) return;
    setQuestions(null);
    (async () => {
      const { data: rawQs } = await supabase
        .from("questions")
        .select("id, test_id, is_correct, time_spent")
        .eq("user_id", targetId)
        .not("is_correct", "is", null);
      if (!rawQs?.length) { setQuestions([]); return; }

      const ids = [...new Set(rawQs.map(q => q.id))];
      const { data: meta } = await supabase
        .from("all_questions").select("uid, sub_category, subject, difficulty").in("uid", ids);
      const metaMap = new Map((meta ?? []).map(m => [m.uid, m]));
      setQuestions(rawQs.map(q => ({
        id: q.id, test_id: q.test_id, is_correct: q.is_correct,
        time_spent: q.time_spent ?? null,
        ...(metaMap.get(q.id) ?? { sub_category: null, subject: null, difficulty: null }),
      })));
    })();
  }, [isViewing, targetId]);

  // All completed tests for own page
  useEffect(() => {
    if (isViewing || !targetId) return;
    setAllTests([]);
    (async () => {
      const { data } = await supabase
        .from("tests")
        .select("id, user_id, test_name, created_at, duration, score, total_questions, configuration")
        .eq("user_id", targetId)
        .not("score", "is", null)
        .order("created_at", { ascending: true });
      setAllTests((data ?? []) as Test[]);
    })();
  }, [isViewing, targetId]);

  // ── derived ────────────────────────────────────────────────────────────────

  // Effective time budget: based on average question count of non-practice tests.
  // Practice tests are excluded from the predicted score entirely.
  const nonPracticeTests = allTests.filter(t => t.test_name !== "Practice");
  const budgetPerQ = nonPracticeTests.length > 0
    ? SHSAT_SECS / (nonPracticeTests.reduce((s, t) => s + (t.total_questions || 100), 0) / nonPracticeTests.length)
    : SHSAT_SECS / 100;

  const stats = (() => {
    if (!questions) return null;
    // Only count questions from non-practice tests for score prediction.
    const scorableQs = nonPracticeTests.length > 0
      ? questions.filter(q => nonPracticeTests.some(t => t.id === q.test_id))
      : questions;

    const subMap = new Map<string, { correct: number; total: number; subject: string; times: number[] }>();
    const subjRaw: Record<string, { correct: number; total: number; times: number[] }> = {};

    for (const q of questions) {
      const k = q.sub_category ?? "Uncategorized";
      const sj = q.subject ?? "Other";
      const t = validTime(q.time_spent);
      const cur = subMap.get(k) ?? { correct: 0, total: 0, subject: sj, times: [] };
      subMap.set(k, { correct: cur.correct + (q.is_correct ? 1 : 0), total: cur.total + 1,
        subject: sj, times: t != null ? [...cur.times, t] : cur.times });
      const sj2 = subjRaw[sj] ?? { correct: 0, total: 0, times: [] };
      subjRaw[sj] = { correct: sj2.correct + (q.is_correct ? 1 : 0), total: sj2.total + 1,
        times: t != null ? [...sj2.times, t] : sj2.times };
    }

    const subcats: SubStat[] = Array.from(subMap.entries())
      .map(([name, v]) => ({ name, subject: v.subject, correct: v.correct, total: v.total,
        accuracy: Math.round(v.correct / v.total * 100), avgSecs: avg(v.times) }))
      .sort((a, b) => a.accuracy - b.accuracy);

    const subjects: Record<string, SubjectStat> = {};
    for (const [k, v] of Object.entries(subjRaw))
      subjects[k] = { correct: v.correct, total: v.total,
        accuracy: Math.round(v.correct / v.total * 100), avgSecs: avg(v.times) };

    const pred = computePrediction(scorableQs, budgetPerQ);
    const correct = questions.filter(q => q.is_correct).length;
    return { pred, overallAcc: Math.round(correct / questions.length * 100),
      total: questions.length, correct, subcats, subjects,
      advice: buildAdvice(subcats, subjects, pred, questions.length, budgetPerQ) };
  })();

  // Chart data — uses nonPracticeTests already computed above
  const shsatTests = nonPracticeTests;

  // Compute per-test SHSAT score (200–700) from difficulty-weighted accuracy.
  // tests.score stores a raw percentage (0–100) and is not used here.
  const shsatChartData = shsatTests.flatMap(t => {
    const testQs = questions?.filter(q => q.test_id === t.id) ?? [];
    if (!testQs.length) return [];
    let earnedW = 0, totalW = 0;
    for (const q of testQs) {
      const w = DIFF_W[normDiff(q.difficulty)];
      totalW += w;
      if (q.is_correct) earnedW += w;
    }
    return [{
      label: new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      date:  new Date(t.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      score: totalW > 0 ? Math.round(earnedW / totalW * 500 + 200) : 200,
      testName: t.test_name,
    }];
  });

  // Overall "Predicted SHSAT" = average of all per-test scores (excluding practice).
  const avgPredictedScore = shsatChartData.length > 0
    ? Math.round(shsatChartData.reduce((s, d) => s + d.score, 0) / shsatChartData.length)
    : null;

  const accuracyChartData = allTests.flatMap(t => {
    const testQs = questions?.filter(q => q.test_id === t.id) ?? [];
    if (!testQs.length) return [];
    const engQs  = testQs.filter(q => q.subject?.toLowerCase() === "english");
    const mathQs = testQs.filter(q => q.subject?.toLowerCase() === "math");
    return [{
      label: new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      date: new Date(t.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      testName: t.test_name,
      overall: Math.round(testQs.filter(q => q.is_correct).length / testQs.length * 100),
      english: engQs.length  ? Math.round(engQs.filter(q => q.is_correct).length  / engQs.length  * 100) : null,
      math:    mathQs.length ? Math.round(mathQs.filter(q => q.is_correct).length / mathQs.length * 100) : null,
    }];
  });

  const avgTimeColor = !stats?.pred.avgSecs ? "text-slate-900"
    : stats.pred.avgSecs <= budgetPerQ       ? "text-emerald-600"
    : stats.pred.avgSecs <= budgetPerQ * 1.3 ? "text-amber-600" : "text-rose-600";

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar only for students viewing their own page */}
      {!isViewing && <SideBar />}

      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="bg-white border-b border-slate-100 px-8 py-4 shadow-sm shrink-0">
          {/* Back button for admin/parent */}
          {isViewing && (
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-700 mb-2 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
          )}
          <h1 className="text-xl font-bold text-slate-900">
            {isViewing && studentName ? `${studentName}'s Performance` : "Performance"}
          </h1>
          <p className="text-sm text-slate-500">Score prediction · accuracy trends · pacing analysis · subcategory breakdown</p>
        </div>

        {questions === null && (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {questions !== null && questions.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-center">
            <div className="flex flex-col items-center gap-2">
              <p className="text-base font-semibold text-slate-700">No question data yet</p>
              <p className="text-sm text-slate-400 max-w-xs">
                Complete a test or practice session to see your score prediction, accuracy trends, and personalized recommendations.
              </p>
            </div>
          </div>
        )}

        {questions !== null && questions.length > 0 && stats && (
          <div className="flex-1 overflow-y-auto px-8 py-6 flex flex-col gap-6">

            {/* ── row 1: key stats ── */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-linear-to-br from-blue-600 to-blue-800 rounded-xl shadow-md p-5 flex flex-col justify-between">
                <p className="text-xs font-semibold text-blue-200 uppercase tracking-wider">Predicted SHSAT</p>
                <div className="mt-2">
                  <p className="text-5xl font-extrabold text-white tabular-nums leading-none">
                    {avgPredictedScore ?? "—"}
                  </p>
                  <p className="text-xs text-blue-200 mt-1">/ 700</p>
                </div>
                {avgPredictedScore == null
                  ? <p className="text-[10px] text-blue-300 mt-3 leading-snug">Complete a mock or diagnostic test</p>
                  : shsatChartData.length > 1
                  ? <p className="text-[10px] text-blue-300 mt-3 leading-snug">Average of {shsatChartData.length} test scores · difficulty-weighted</p>
                  : <p className="text-[10px] text-blue-300 mt-3 leading-snug">From 1 completed test · difficulty-weighted</p>
                }
              </div>
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Questions Done</p>
                <p className="text-3xl font-bold text-slate-900">{stats.total}</p>
                <p className="text-xs text-slate-400 mt-0.5">{stats.correct} correct</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Overall Accuracy</p>
                <p className="text-3xl font-bold text-slate-900">{stats.overallAcc}%</p>
                <p className="text-xs text-slate-400 mt-0.5">all question types</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Avg Time / Q</p>
                <p className={`text-3xl font-bold tabular-nums ${avgTimeColor}`}>
                  {stats.pred.avgSecs != null ? `${Math.round(stats.pred.avgSecs)}s` : "—"}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">SHSAT budget: ~{Math.round(budgetPerQ)}s</p>
              </div>
            </div>

            {/* ── SHSAT Score History ── */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
              <div className="mb-1">
                <h2 className="text-sm font-semibold text-slate-800">SHSAT Score History</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Scores from completed mock and diagnostic tests on the SHSAT 200–700 scale, computed using
                  difficulty-weighted accuracy (easy 1pt · medium 1.5pt · hard 2pt). Reference lines show
                  competitive cutoffs for NYC specialized high schools.
                </p>
              </div>

              {shsatChartData.length === 0 ? (
                <p className="text-sm text-slate-400 mt-4">Complete a mock or diagnostic test to see your SHSAT score trend.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={shsatChartData} margin={{ top: 16, right: 24, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis domain={[200, 700]} ticks={[200, 300, 400, 500, 580, 620, 700]}
                      tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip content={<SHSATTooltip />} />
                    <ReferenceLine y={620} stroke="#10b981" strokeDasharray="5 4" strokeWidth={1.5}
                      label={{ value: "620 – Top schools", position: "insideTopRight", fontSize: 10, fill: "#10b981", dy: -4 }} />
                    <ReferenceLine y={580} stroke="#3b82f6" strokeDasharray="5 4" strokeWidth={1.5}
                      label={{ value: "580 – Competitive", position: "insideTopRight", fontSize: 10, fill: "#3b82f6", dy: -4 }} />
                    <ReferenceLine y={500} stroke="#f59e0b" strokeDasharray="5 4" strokeWidth={1.5}
                      label={{ value: "500 – Approaching", position: "insideTopRight", fontSize: 10, fill: "#f59e0b", dy: -4 }} />
                    <Line type="monotone" dataKey="score" name="SHSAT Score" stroke="#3b82f6" strokeWidth={2.5}
                      dot={{ r: 5, fill: "#3b82f6", strokeWidth: 0 }} activeDot={{ r: 7 }} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── Accuracy Improvement ── */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
              <div className="mb-1">
                <h2 className="text-sm font-semibold text-slate-800">Accuracy Over Time</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Percentage of questions answered correctly per test across all test types (mock, diagnostic, and practice).
                  An upward trend means your skills are improving. Dashed lines show English and Math separately.
                </p>
              </div>

              {accuracyChartData.length === 0 ? (
                <p className="text-sm text-slate-400 mt-4">Complete at least one test to see your accuracy trend.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={accuracyChartData} margin={{ top: 16, right: 24, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`}
                      tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip content={<AccuracyTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Line type="monotone" dataKey="overall" name="Overall" stroke="#64748b" strokeWidth={2.5}
                      dot={{ r: 5, fill: "#64748b", strokeWidth: 0 }} activeDot={{ r: 7 }} connectNulls={false} />
                    <Line type="monotone" dataKey="english" name="English" stroke="#3b82f6" strokeWidth={2}
                      strokeDasharray="6 3" dot={{ r: 4, fill: "#3b82f6", strokeWidth: 0 }} activeDot={{ r: 6 }} connectNulls={false} />
                    <Line type="monotone" dataKey="math" name="Math" stroke="#8b5cf6" strokeWidth={2}
                      strokeDasharray="6 3" dot={{ r: 4, fill: "#8b5cf6", strokeWidth: 0 }} activeDot={{ r: 6 }} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── By Subject + Recommendations ── */}
            <div className="grid grid-cols-3 gap-4">
              {/* Subject breakdown */}
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">By Subject</h2>
                <div className="flex flex-col gap-5">
                  {Object.entries(stats.subjects).map(([subj, v]) => (
                    <div key={subj} className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-slate-700">{subj}</span>
                        <div className="flex items-center gap-2">
                          <TimeTag secs={v.avgSecs} budget={budgetPerQ} />
                          <span className="text-sm font-bold tabular-nums text-slate-900">{v.accuracy}%</span>
                        </div>
                      </div>
                      <Bar pct={v.accuracy} color={subj === "English" ? "bg-blue-400" : "bg-violet-400"} />
                      <p className="text-xs text-slate-400">{v.correct} / {v.total} correct</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommendations */}
              <div className="col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm p-6 flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Recommendations</h2>
                <div className="grid grid-cols-2 gap-3">
                  {stats.advice.map((a, i) => {
                    const s = ASTYLE[a.type];
                    return (
                      <div key={i} className={`${s.card} rounded-r-lg px-4 py-3`}>
                        <p className={`text-xs font-bold mb-0.5 ${s.h}`}>{a.heading}</p>
                        <p className="text-xs text-slate-600 leading-relaxed">{a.body}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Subcategory breakdown ── */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Subcategory Breakdown</h2>
                <div className="flex items-center gap-3 text-[10px] text-slate-400">
                  <span>sorted weakest → strongest</span>
                  <span>time:
                    <span className="text-emerald-600 font-semibold ml-1">fast</span>
                    <span className="text-amber-600 font-semibold ml-1">ok</span>
                    <span className="text-rose-600 font-semibold ml-1">slow</span>
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                {stats.subcats.map(s => {
                  const acc = s.accuracy;
                  const barC = acc >= 80 ? "bg-emerald-400" : acc >= 60 ? "bg-blue-400" : acc >= 40 ? "bg-amber-400" : "bg-rose-400";
                  const txtC = acc >= 80 ? "text-emerald-600" : acc >= 60 ? "text-blue-600" : acc >= 40 ? "text-amber-600" : "text-rose-600";
                  const tagC = s.subject === "English" ? "bg-blue-50 text-blue-600"
                    : s.subject === "Math" ? "bg-violet-50 text-violet-600" : "bg-slate-100 text-slate-500";
                  return (
                    <div key={s.name} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${tagC}`}>
                            {s.subject?.slice(0, 3) ?? "—"}
                          </span>
                          <span className="text-xs font-medium text-slate-700 truncate">{fmtSub(s.name)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-slate-400 tabular-nums">{s.correct}/{s.total}</span>
                          <TimeTag secs={s.avgSecs} budget={budgetPerQ} />
                          <span className={`text-xs font-bold w-9 text-right tabular-nums ${txtC}`}>{acc}%</span>
                        </div>
                      </div>
                      <Bar pct={acc} color={barC} />
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
