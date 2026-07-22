import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { supabase } from "../supabase-client";
import { processPassage } from "./textParser";

export interface IncorrectQuestion {
  questionNumber: number;
  uid: string;
  text: string;
  type: string;
  choices: Array<string | null>;
  studentAnswer: string | null;
  correctAnswer: string;
  subject: string | null;
  passageContent: string | null;
}

export interface IncorrectReportSection {
  testName: string;
  testDate?: string;      // ISO date string — shown in multi-test headers
  totalQuestions?: number;
  correctCount?: number;
  questions: IncorrectQuestion[];
}

export interface IncorrectReportData {
  studentName: string;
  sections: IncorrectReportSection[];
}

type QDetail = {
  uid: string;
  text: string;
  answer: string;
  type: string;
  choice_1: string | null;
  choice_2: string | null;
  choice_3: string | null;
  choice_4: string | null;
  extra_data?: Record<string, unknown> | null;
  subject: string | null;
  sub_category: string | null;
};

async function fetchWrongQuestionsForTests(
  testIds: string[],
  userId: string,
): Promise<{ id: string; order_index: number; student_answer: string | null; test_id: string }[]> {
  const { data } = await supabase
    .from("questions")
    .select("id, order_index, student_answer, test_id")
    .in("test_id", testIds)
    .eq("user_id", userId)
    .eq("is_correct", false)
    .order("order_index");
  return (data ?? []) as { id: string; order_index: number; student_answer: string | null; test_id: string }[];
}

export async function fetchIncorrectReport(
  testId: string,
  userId: string,
  testName: string,
  studentName: string,
  meta?: { totalQuestions?: number; correctCount?: number; testDate?: string },
): Promise<IncorrectReportData | null> {
  const wrongQs = await fetchWrongQuestionsForTests([testId], userId);
  if (wrongQs.length === 0) return null;

  const uids = wrongQs.map(q => q.id);
  const [{ data: qDetails }, { data: mediaItems }] = await Promise.all([
    supabase
      .from("all_questions")
      .select("uid, text, answer, type, choice_1, choice_2, choice_3, choice_4, extra_data, subject, sub_category")
      .in("uid", uids),
    supabase
      .from("dictionary_of_media")
      .select("question_id, content")
      .in("question_id", uids)
      .eq("media_type", "passage"),
  ]);

  const passageMap = new Map<string, string>();
  for (const item of (mediaItems ?? []) as { question_id: string; content: string }[]) {
    passageMap.set(item.question_id, item.content);
  }
  const detailMap = new Map<string, QDetail>();
  for (const q of (qDetails ?? []) as QDetail[]) detailMap.set(q.uid, q);

  const questions = buildQuestions(wrongQs, detailMap, passageMap);
  return { studentName, sections: [{ testName, questions, ...meta }] };
}

export async function fetchFullIncorrectReport(
  tests: Array<{ id: string; test_name: string; created_at?: string; total_questions?: number; score?: number }>,
  userId: string,
  studentName: string,
): Promise<IncorrectReportData | null> {
  const completedIds = tests.map(t => t.id);
  const wrongQs = await fetchWrongQuestionsForTests(completedIds, userId);
  if (wrongQs.length === 0) return null;

  const uids = wrongQs.map(q => q.id);
  const [{ data: qDetails }, { data: mediaItems }] = await Promise.all([
    supabase
      .from("all_questions")
      .select("uid, text, answer, type, choice_1, choice_2, choice_3, choice_4, extra_data, subject, sub_category")
      .in("uid", uids),
    supabase
      .from("dictionary_of_media")
      .select("question_id, content")
      .in("question_id", uids)
      .eq("media_type", "passage"),
  ]);

  const passageMap = new Map<string, string>();
  for (const item of (mediaItems ?? []) as { question_id: string; content: string }[]) {
    passageMap.set(item.question_id, item.content);
  }
  const detailMap = new Map<string, QDetail>();
  for (const q of (qDetails ?? []) as QDetail[]) detailMap.set(q.uid, q);

  const byTestId = new Map<string, typeof wrongQs>();
  for (const wq of wrongQs) {
    if (!byTestId.has(wq.test_id)) byTestId.set(wq.test_id, []);
    byTestId.get(wq.test_id)!.push(wq);
  }

  // Sort oldest → newest so the report reads as a timeline
  const sortedTests = [...tests].sort((a, b) => {
    if (!a.created_at || !b.created_at) return 0;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  const sections: IncorrectReportSection[] = sortedTests
    .map(t => ({
      testName: t.test_name,
      testDate: t.created_at,
      totalQuestions: t.total_questions,
      correctCount: t.score,
      questions: buildQuestions(byTestId.get(t.id) ?? [], detailMap, passageMap),
    }))
    .filter(s => s.questions.length > 0);

  if (sections.length === 0) return null;
  return { studentName, sections };
}

function buildQuestions(
  wrongQs: { id: string; order_index: number; student_answer: string | null; test_id: string }[],
  detailMap: Map<string, QDetail>,
  passageMap: Map<string, string>,
): IncorrectQuestion[] {
  return wrongQs.flatMap(wq => {
    const d = detailMap.get(wq.id);
    if (!d) return [];
    const extra = (d.extra_data ?? {}) as Record<string, unknown>;
    return [{
      questionNumber: wq.order_index,
      uid: wq.id,
      text: d.text,
      type: d.type,
      choices: [
        d.choice_1, d.choice_2, d.choice_3, d.choice_4,
        (extra.choice_5 as string | null) ?? null,
        (extra.choice_6 as string | null) ?? null,
      ],
      studentAnswer: wq.student_answer,
      correctAnswer: d.answer,
      subject: d.subject,
      passageContent: passageMap.get(wq.id) ?? null,
    } satisfies IncorrectQuestion];
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Answer matching — handles A/B/C/D and non-standard G/H/I/J letter schemes
// ─────────────────────────────────────────────────────────────────────────────

interface ChoiceInfo {
  index: number;   // position in choices array (0-based)
  letter: string;  // actual letter from stored prefix, or positional fallback A/B/C…
  display: string; // text to show (prefix stripped)
  raw: string;     // original stored text
}

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Parse each non-empty choice into a ChoiceInfo, extracting its real stored letter.
function buildChoiceInfos(choices: Array<string | null>): ChoiceInfo[] {
  return choices.flatMap((raw, index) => {
    if (!raw) return [];
    const m = raw.match(/^([A-Za-z])[).:\s]/);
    const letter  = m ? m[1].toUpperCase() : (ALPHA[index] ?? String.fromCharCode(65 + index));
    const display = m ? raw.slice(m[0].length).trim() : raw.trim();
    return [{ index, letter, display, raw }];
  });
}

// Find the ChoiceInfo that a single answer part resolves to.
// Order: exact raw → stripped text → letter match → positional fallback.
function matchOnePart(part: string, infos: ChoiceInfo[]): ChoiceInfo | undefined {
  const ans = part.trim();
  if (!ans) return undefined;

  // 1. Exact raw match
  const byExact = infos.find(c => c.raw.trim() === ans);
  if (byExact) return byExact;

  // 2. Stripped-text match (answer stripped of its own letter prefix vs choice display text)
  const prefixM = ans.match(/^([A-Za-z])[).:\s]/);
  const ansText = prefixM ? ans.slice(prefixM[0].length).trim() : ans;
  if (ansText) {
    const byText = infos.find(c => c.display === ansText || c.display.trim() === ansText);
    if (byText) return byText;
  }

  // 3. Letter match: answer's letter → find choice whose stored letter equals it
  const ansLetter = prefixM
    ? prefixM[1].toUpperCase()
    : /^[A-Za-z]$/.test(ans) ? ans.toUpperCase() : null;

  if (ansLetter) {
    const byLetter = infos.find(c => c.letter === ansLetter);
    if (byLetter) return byLetter;
  }

  // 4. Positional fallback — only when no choice has a stored letter prefix
  //    (i.e., all letters are our own positional fallbacks, not from the DB)
  const anyStoredLetters = infos.some(c => /^[A-Za-z][).:\s]/.test(c.raw));
  if (!anyStoredLetters && ansLetter) {
    const posIdx = ALPHA.indexOf(ansLetter);
    if (posIdx >= 0 && posIdx < infos.length) return infos[posIdx];
  }

  return undefined;
}

// Resolve a (possibly comma-separated) answer string to matched ChoiceInfo indices.
function resolveAnswer(answer: string | null, infos: ChoiceInfo[]): Set<number> {
  if (!answer) return new Set();
  const matched = new Set<number>();
  for (const part of answer.split(",")) {
    const info = matchOnePart(part.trim(), infos);
    if (info) matched.add(info.index);
  }
  return matched;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML building
// ─────────────────────────────────────────────────────────────────────────────


// Ensure spaces around inline formatting tags so bold/italic text doesn't
// collide with adjacent words (e.g. "is<b>most</b>relevant" → "is <b>most</b> relevant").
// Also converts literal \n characters to <br> for multi-line text.
function prepareHtml(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/(\w)(<(?:b|strong|i|em|u|sup|sub)[^>]*>)/gi, "$1 $2")
    .replace(/(<\/(?:b|strong|i|em|u|sup|sub)>)(\w)/gi, "$1 $2")
    .replace(/\n/g, "<br>");
}

// For Revising & Editing questions: split "Which sentence…? (1)…(2)…" into
// a question prompt and an embedded passage so they render in separate blocks.
function extractEmbeddedPassage(text: string): { prompt: string; passageText: string } | null {
  const idx = text.search(/\(\d{1,2}\)/);
  if (idx === -1) return null;
  const passageText = text.slice(idx).trim();
  if ((passageText.match(/\(\d{1,2}\)/g) ?? []).length < 2) return null;
  return { prompt: text.slice(0, idx).trim(), passageText };
}

function renderQuestion(q: IncorrectQuestion): string {
  const isChoiceBased = ["mcq", "multi-select", "inline-dropdown"].includes(q.type);

  let answersHTML = "";

  if (!isChoiceBased) {
    const hasAnswer = !!q.studentAnswer;
    answersHTML = `
      <div style="display:flex;gap:0;margin-top:10px;border-radius:8px;overflow:hidden;border:1.5px solid #e5e7eb;">
        <div style="flex:1;padding:9px 13px;background:${hasAnswer ? "#fef2f2" : "#f9fafb"};border-right:1.5px solid ${hasAnswer ? "#fecaca" : "#e5e7eb"};">
          <div style="font-size:9px;font-weight:700;color:${hasAnswer ? "#dc2626" : "#9ca3af"};text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px;">Your Answer</div>
          <div style="font-size:13px;font-weight:700;color:${hasAnswer ? "#dc2626" : "#9ca3af"};font-style:${hasAnswer ? "normal" : "italic"};">${hasAnswer ? q.studentAnswer : "Skipped"}</div>
        </div>
        <div style="flex:1;padding:9px 13px;background:#f0fdf4;">
          <div style="font-size:9px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px;">Correct Answer</div>
          <div style="font-size:13px;font-weight:700;color:#15803d;">${q.correctAnswer}</div>
        </div>
      </div>`;
  } else {
    const infos           = buildChoiceInfos(q.choices);
    const correctIndices  = resolveAnswer(q.correctAnswer, infos);
    const studentIndices  = resolveAnswer(q.studentAnswer, infos);

    const choiceRows = infos.map(({ index, letter, display }) => {
      const isCorrect  = correctIndices.has(index);
      const isStudent  = studentIndices.has(index);

      const bg         = isCorrect ? "#f0fdf4"  : isStudent ? "#fff1f2"  : "#fafafa";
      const border     = isCorrect ? "#86efac"  : isStudent ? "#fda4af"  : "#e5e7eb";
      const textColor  = isCorrect ? "#14532d"  : isStudent ? "#9f1239"  : "#374151";
      const pillBg     = isCorrect ? "#16a34a"  : isStudent ? "#e11d48"  : "#d1d5db";
      const pillColor  = isCorrect || isStudent ? "#ffffff" : "#6b7280";

      const badge = isCorrect
        ? `<span style="flex-shrink:0;margin-left:8px;padding:2px 8px;border-radius:20px;font-size:9.5px;font-weight:800;background:#dcfce7;color:#16a34a;border:1px solid #86efac;white-space:nowrap;">&#10003; Correct</span>`
        : isStudent
        ? `<span style="flex-shrink:0;margin-left:8px;padding:2px 8px;border-radius:20px;font-size:9.5px;font-weight:800;background:#ffe4e6;color:#e11d48;border:1px solid #fda4af;white-space:nowrap;">&#10007; Your Answer</span>`
        : "";

      return `
        <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:7px;background:${bg};border:1.5px solid ${border};margin-bottom:5px;">
          <span style="flex-shrink:0;width:20px;height:20px;border-radius:5px;background:${pillBg};color:${pillColor};font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;">${letter}</span>
          <span style="font-size:12px;color:${textColor};line-height:1.45;flex:1;">${prepareHtml(display)}</span>
          ${badge}
        </div>`;
    }).join("");

    // Fallback note when student answer couldn't be mapped to any choice
    const studentUnmatched = q.studentAnswer && studentIndices.size === 0;
    const skipped          = !q.studentAnswer;
    const note = studentUnmatched
      ? `<div style="margin-top:4px;font-size:10px;color:#9ca3af;font-style:italic;">Student submitted: &ldquo;${q.studentAnswer}&rdquo;</div>`
      : skipped
      ? `<div style="margin-top:4px;font-size:10px;color:#9ca3af;font-style:italic;">Skipped &#8212; no answer submitted</div>`
      : "";

    answersHTML = `<div style="margin-top:8px;">${choiceRows}${note}</div>`;
  }

  const isEla = (q.subject ?? "").toLowerCase() === "english";
  const embedded = isEla ? extractEmbeddedPassage(q.text) : null;

  let questionBodyHTML: string;
  if (embedded) {
    const sentences = embedded.passageText.split(/\s+(?=\(\d{1,2}\))/).filter(Boolean);
    const sentenceHTML = sentences.map(s =>
      `<p style="margin:0 0 2px 0;font-size:11px;line-height:1.55;color:#1e3a5f;">${prepareHtml(s)}</p>`
    ).join("");
    questionBodyHTML = `
      ${embedded.prompt ? `<div style="font-size:12.5px;color:#111827;line-height:1.6;margin-bottom:8px;">${prepareHtml(embedded.prompt)}</div>` : ""}
      <div style="border:1.5px solid #bfdbfe;border-radius:8px;background:#eff6ff;padding:10px 13px;margin-bottom:8px;">
        <div style="font-size:9px;font-weight:700;color:#3b82f6;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px;">Article</div>
        ${sentenceHTML}
      </div>`;
  } else {
    questionBodyHTML = `<div style="font-size:12.5px;color:#111827;line-height:1.6;">${prepareHtml(q.text)}</div>`;
  }

  return `
    <div style="margin-bottom:14px;padding:13px 15px;border:1.5px solid #e5e7eb;border-radius:10px;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:4px;">
        <span style="flex-shrink:0;width:23px;height:23px;border-radius:6px;background:#1d4ed8;color:#ffffff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;margin-top:1px;">${q.questionNumber}</span>
        <div style="flex:1;">${questionBodyHTML}</div>
      </div>
      ${answersHTML}
    </div>`;
}

// Each paragraph becomes its own canvas fragment with passageId so the PDF
// layout engine can apply no-split to every paragraph and then draw one fresh
// border rectangle around all same-id fragments visible on each page.
function buildPassageParagraphFragments(passageText: string, passageId: string): FragSpec[] {
  const paragraphs = processPassage(passageText);
  return paragraphs.map((p, i) => {
    const isFirst    = i === 0;
    const isLast     = i === paragraphs.length - 1;
    const isTitle    = isFirst && !/^\(\d/.test(p) && p.length < 80;
    const isNumbered = /^\(\d+\)/.test(p);
    const mb         = isTitle ? "8px" : isNumbered ? "1px" : "4px";
    const topPad     = isFirst ? "13px" : "2px";
    const botPad     = isLast  ? "13px" : "2px";
    const label      = isFirst
      ? `<div style="font-size:9px;font-weight:700;color:#3b82f6;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Passage</div>`
      : "";
    const html = `<div style="background:#eff6ff;padding:${topPad} 15px ${botPad} 15px;">${label}<p style="margin:0 0 ${mb} 0;font-size:11px;line-height:1.6;color:#1e3a5f;${isTitle ? "font-weight:700;text-align:center;" : ""}">${prepareHtml(p)}</p></div>`;
    return { html, style: PASSAGE_PARA_FRAG_STYLE, passageId };
  });
}

function buildSubjectHeaderHTML(label: string, color: string, dividerBg: string, count: number): string {
  return `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
      <span style="font-size:13px;font-weight:800;color:${color};">${label}</span>
      <div style="flex:1;height:1.5px;background:${dividerBg};border-radius:1px;"></div>
      <span style="font-size:11px;color:#6b7280;">${count} missed</span>
    </div>`;
}

function buildSubSectionLabelHTML(label: string): string {
  return `<p style="font-size:9.5px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px 0;">${label}</p>`;
}

function buildSectionHeaderHTML(section: IncorrectReportSection): string {
  const dateLine = section.testDate
    ? `<span style="font-size:10px;color:#9ca3af;display:block;margin-top:1px;">${new Date(section.testDate).toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>`
    : "";
  // score is stored as a 0-100 percentage; derive raw counts from it
  const correctRaw = section.totalQuestions != null && section.correctCount != null
    ? Math.round(section.totalQuestions * section.correctCount / 100) : null;
  const missedRaw  = section.totalQuestions != null && correctRaw != null
    ? section.totalQuestions - correctRaw : null;
  const statParts: string[] = [];
  if (section.totalQuestions != null)
    statParts.push(`<span style="color:#374151;"><b>${section.totalQuestions}</b> total</span>`);
  if (correctRaw != null)
    statParts.push(`<span style="color:#16a34a;"><b>${correctRaw}</b> correct</span>`);
  if (missedRaw != null)
    statParts.push(`<span style="color:#dc2626;"><b>${missedRaw}</b> missed</span>`);
  const statsLine = statParts.length > 0
    ? `<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:5px;font-size:10px;">${statParts.join("")}</div>`
    : "";
  const badgeCount = missedRaw ?? section.questions.length;
  return `
    <div style="padding:10px 14px;background:#f3f4f6;border-left:4px solid #6366f1;border-radius:0 8px 8px 0;margin-bottom:14px;margin-top:8px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
        <div>
          <span style="font-size:14px;font-weight:800;color:#1f2937;display:block;">${section.testName}</span>
          ${dateLine}
          ${statsLine}
        </div>
        <span style="flex-shrink:0;padding:2px 10px;border-radius:20px;font-size:10px;font-weight:700;background:#ffe4e6;color:#e11d48;border:1px solid #fda4af;white-space:nowrap;margin-top:2px;">${badgeCount} missed</span>
      </div>
    </div>`;
}

// Each fragment carries optional per-fragment CSS and a passage group ID.
// Passage paragraphs use PASSAGE_PARA_FRAG_STYLE (no vertical padding) so they
// stack tightly.  The PDF loop groups same-passageId fragments per page and draws
// a single border rect around the group — creating a fresh box on every page.
type FragSpec = { html: string; style?: string; passageId?: string };
const frag = (html: string): FragSpec => ({ html });

function buildSectionFragments(section: IncorrectReportSection, showHeader: boolean): FragSpec[] {
  const frags: FragSpec[] = [];

  if (showHeader) frags.push(frag(buildSectionHeaderHTML(section)));

  const elaQs  = section.questions.filter(q => (q.subject ?? "").toLowerCase() === "english");
  const mathQs = section.questions.filter(q => (q.subject ?? "").toLowerCase() !== "english");

  if (elaQs.length > 0) {
    frags.push(frag(buildSubjectHeaderHTML("ELA", "#2563eb", "#dbeafe", elaQs.length)));

    const standaloneQs = elaQs.filter(q => !q.passageContent);
    const rcQs         = elaQs.filter(q =>  q.passageContent);

    const passageGroupMap = new Map<string, IncorrectQuestion[]>();
    for (const q of rcQs) {
      const key = q.passageContent!;
      if (!passageGroupMap.has(key)) passageGroupMap.set(key, []);
      passageGroupMap.get(key)!.push(q);
    }
    const passageGroups = [...passageGroupMap.entries()]
      .sort(([, a], [, b]) => a[0].questionNumber - b[0].questionNumber);

    if (standaloneQs.length > 0) {
      frags.push(frag(buildSubSectionLabelHTML("Revising &amp; Editing")));
      for (const q of standaloneQs) frags.push(frag(renderQuestion(q)));
    }

    let pIdx = 0;
    for (const [passageText, qs] of passageGroups) {
      const passageId = `${section.testName}::${pIdx++}`;
      frags.push(frag(buildSubSectionLabelHTML("Reading Comprehension")));
      frags.push(...buildPassageParagraphFragments(passageText, passageId));
      for (const q of qs) frags.push(frag(renderQuestion(q)));
    }
  }

  if (mathQs.length > 0) {
    frags.push(frag(buildSubjectHeaderHTML("Math", "#7c3aed", "#ede9fe", mathQs.length)));
    for (const q of mathQs) frags.push(frag(renderQuestion(q)));
  }

  return frags;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-fragment HTML builders (header / footer are separate from sections so
// each chunk stays short enough for html2canvas to render without blank areas)
// ─────────────────────────────────────────────────────────────────────────────

function buildReportHeaderHTML(data: IncorrectReportData, dateStr: string): string {
  const isSingle    = data.sections.length === 1;
  const testName    = isSingle ? data.sections[0].testName : "All Tests";
  const totalMissed = data.sections.reduce((n, s) => n + s.questions.length, 0);

  let singleStatsHTML = "";
  if (isSingle) {
    const s = data.sections[0];
    // score is stored as a 0-100 percentage; derive raw counts
    const correctRaw = s.totalQuestions != null && s.correctCount != null
      ? Math.round(s.totalQuestions * s.correctCount / 100) : null;
    const missedRaw  = s.totalQuestions != null && correctRaw != null
      ? s.totalQuestions - correctRaw : null;
    const parts: string[] = [];
    if (s.totalQuestions != null)
      parts.push(`<span><b>${s.totalQuestions}</b> total</span>`);
    if (correctRaw != null)
      parts.push(`<span style="color:#16a34a;"><b>${correctRaw}</b> correct</span>`);
    if (missedRaw != null)
      parts.push(`<span style="color:#dc2626;"><b>${missedRaw}</b> missed</span>`);
    if (s.testDate)
      parts.push(`<span>${new Date(s.testDate).toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>`);
    if (parts.length > 0)
      singleStatsHTML = `<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:6px;font-size:10.5px;color:#6b7280;">${parts.join("")}</div>`;
  }

  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:2px solid #f3f4f6;">
      <div>
        <div style="font-size:15px;font-weight:800;color:#111827;font-family:'Outfit',sans-serif;letter-spacing:-0.03em;margin-bottom:5px;">&#128081; TestQueens</div>
        <h1 style="font-size:19px;font-weight:800;color:#111827;margin:0 0 4px 0;">Missed Questions Report</h1>
        <p style="font-size:12.5px;font-weight:600;color:#374151;margin:0 0 2px 0;">${testName}</p>
        <p style="font-size:11.5px;color:#6b7280;margin:0 0 2px 0;">${data.studentName}</p>
        <p style="font-size:10.5px;color:#9ca3af;margin:0;">${dateStr}</p>
        ${singleStatsHTML}
      </div>
      <div style="text-align:center;background:#fef2f2;border:1.5px solid #fecaca;border-radius:12px;padding:12px 18px;flex-shrink:0;">
        <div style="font-size:28px;font-weight:900;color:#dc2626;line-height:1;">${totalMissed}</div>
        <div style="font-size:10px;font-weight:600;color:#f87171;margin-top:3px;text-transform:uppercase;letter-spacing:.04em;">Missed</div>
      </div>
    </div>`;
}

function buildReportFooterHTML(dateStr: string): string {
  return `
    <div style="padding-top:12px;border-top:1px solid #f3f4f6;display:flex;justify-content:space-between;font-size:10px;color:#9ca3af;">
      <span style="font-family:'Outfit',sans-serif;font-weight:700;letter-spacing:-0.02em;">TestQueens</span>
      <span>Generated ${dateStr}</span>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Export — renders each fragment (header, section, footer) to its own small
// canvas, then places each canvas directly into jsPDF page-by-page.
// No mega-canvas merge: a 100M+ pixel merged canvas causes toDataURL() to
// return empty data in Chrome, which produces blank PDF pages.
// ─────────────────────────────────────────────────────────────────────────────

// z-index:-1 puts fragments behind the page background so users never see them
// during generation; html2canvas captures elements by reading their properties
// directly and is unaffected by z-index.
const FRAG_STYLE = [
  "position:fixed", "top:0", "left:0", "width:794px", "background:white",
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  "font-size:13px", "color:#111827", "padding:20px 40px",
  "box-sizing:border-box", "pointer-events:none", "z-index:-1",
].join(";");

// No vertical padding — passage paragraph canvases stack tightly with no gap.
const PASSAGE_PARA_FRAG_STYLE = [
  "position:fixed", "top:0", "left:0", "width:794px", "background:white",
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  "font-size:13px", "color:#111827", "padding:0 40px",
  "box-sizing:border-box", "pointer-events:none", "z-index:-1",
].join(";");

// Mount all fragments at once, wait a single double-RAF for Chrome to paint,
// then capture each via html2canvas (DOM-based, so overlapping siblings are fine).
// This is much faster than the old per-fragment mount-wait-capture-remove loop.
async function renderFragmentsBatch(specs: FragSpec[]): Promise<HTMLCanvasElement[]> {
  const elements = specs.map(spec => {
    const el = document.createElement("div");
    el.style.cssText = spec.style ?? FRAG_STYLE;
    el.innerHTML = spec.html;
    document.body.appendChild(el);
    return el;
  });
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const canvases: HTMLCanvasElement[] = [];
  for (const el of elements) {
    canvases.push(await html2canvas(el, {
      scale: 2, useCORS: true, logging: false,
      backgroundColor: "#ffffff", windowWidth: 794,
    }));
  }
  elements.forEach(el => document.body.removeChild(el));
  return canvases;
}

// Padding from FRAG_STYLE ("padding:20px 40px" on 794px-wide element), converted to mm.
// Used to align the jsPDF passage border with where the passage div actually sits.
const FRAG_PAD_H_MM = 40 / 794 * 210;  // horizontal padding → ~10.6 mm
const FRAG_PAD_V_MM = 20 / 794 * 210;  // vertical padding   → ~5.3 mm

export async function exportIncorrectPDF(data: IncorrectReportData): Promise<void> {
  const isSingle = data.sections.length === 1;
  const dateStr  = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const allSpecs: FragSpec[] = [
    frag(buildReportHeaderHTML(data, dateStr)),
    ...data.sections.flatMap(s => buildSectionFragments(s, !isSingle)),
    frag(buildReportFooterHTML(dateStr)),
  ];
  const fragPassageIds = allSpecs.map(f => f.passageId ?? null);

  // Loading modal — hides the brief rendering flash while giving the user
  // clear feedback.  data-html2canvas-ignore tells html2canvas to skip it.
  const spinKf = document.createElement("style");
  spinKf.textContent = "@keyframes _pdfSpin{to{transform:rotate(360deg)}}";
  document.head.appendChild(spinKf);

  const overlay = document.createElement("div");
  overlay.setAttribute("data-html2canvas-ignore", "true");
  overlay.style.cssText = [
    "position:fixed", "inset:0", "z-index:2147483647",
    "background:rgba(0,0,0,0.4)",
    "display:flex", "align-items:center", "justify-content:center",
  ].join(";");
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:28px 36px;
                box-shadow:0 20px 60px rgba(0,0,0,0.25);
                display:flex;flex-direction:column;align-items:center;gap:14px;min-width:200px;
                font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="width:36px;height:36px;border:3.5px solid #e5e7eb;border-top-color:#6366f1;
                  border-radius:50%;animation:_pdfSpin 0.8s linear infinite;"></div>
      <div style="font-size:15px;font-weight:700;color:#111827;">Generating PDF</div>
      <div style="font-size:12px;color:#9ca3af;">Please wait…</div>
    </div>`;
  document.body.appendChild(overlay);

  let fragCanvases: HTMLCanvasElement[];
  try {
    fragCanvases = await renderFragmentsBatch(allSpecs);
  } finally {
    document.body.removeChild(overlay);
    document.head.removeChild(spinKf);
  }

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW  = pdf.internal.pageSize.getWidth();   // 210 mm
  const PH  = pdf.internal.pageSize.getHeight();  // 297 mm

  // Virtual layout:
  // - Non-passage fragments: no-split (advance to next page if they won't fit whole)
  // - Passage fragments: allowed to span pages; jsPDF draws borders per-page portion
  const fragHeightMm: number[] = fragCanvases.map(c => (c.height * PW) / c.width);
  const fragStartMm: number[]  = [];
  let vy = 0;
  for (let fi = 0; fi < fragHeightMm.length; fi++) {
    const h = fragHeightMm[fi];
    const usedOnPage = vy % PH;
    const spaceLeft  = usedOnPage === 0 ? PH : PH - usedOnPage;
    if (h > spaceLeft && h <= PH) vy = Math.ceil(vy / PH) * PH;
    fragStartMm.push(vy);
    vy += h;
  }
  const totalMm = vy;

  const numPages = Math.max(1, Math.ceil(totalMm / PH));
  for (let p = 0; p < numPages; p++) {
    if (p > 0) pdf.addPage();
    const pageTop    = p * PH;
    const pageBottom = pageTop + PH;

    for (let fi = 0; fi < fragCanvases.length; fi++) {
      const fTop = fragStartMm[fi];
      const fBot = fTop + fragHeightMm[fi];
      if (fBot <= pageTop || fTop >= pageBottom) continue;

      const imgYOnPage = fTop - pageTop;  // can be negative when fragment started on prev page
      const imgData = fragCanvases[fi].toDataURL("image/jpeg", 0.92);
      pdf.addImage(imgData, "JPEG", 0, imgYOnPage, PW, fragHeightMm[fi], `frag_${fi}`);
    }

    // Draw one fresh border rectangle per passage visible on this page.
    // Collect the union of all same-passageId fragment ranges, then draw one rect.
    const passageBoxes = new Map<string, { top: number; bot: number }>();
    for (let fi = 0; fi < fragCanvases.length; fi++) {
      const pid = fragPassageIds[fi];
      if (!pid) continue;
      const fTop = fragStartMm[fi];
      const fBot = fTop + fragHeightMm[fi];
      if (fBot <= pageTop || fTop >= pageBottom) continue;
      const visTop = Math.max(fTop, pageTop) - pageTop;
      const visBot = Math.min(fBot, pageBottom) - pageTop;
      const cur = passageBoxes.get(pid);
      if (cur) { cur.top = Math.min(cur.top, visTop); cur.bot = Math.max(cur.bot, visBot); }
      else passageBoxes.set(pid, { top: visTop, bot: visBot });
    }
    for (const { top, bot } of passageBoxes.values()) {
      if (bot - top > 0) {
        pdf.setDrawColor(191, 219, 254);  // #bfdbfe
        pdf.setLineWidth(0.4);
        pdf.rect(FRAG_PAD_H_MM, top, PW - 2 * FRAG_PAD_H_MM, bot - top, "S");
      }
    }
  }

  const base = isSingle
    ? data.sections[0].testName.replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "report"
    : `${data.studentName.replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "student"} - All Tests`;
  pdf.save(`${base} - Missed Questions.pdf`);
}
