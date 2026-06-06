import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export interface PDFSubcategory {
  name: string;
  score: number;
  correct: number;
  total: number;
  subject: string;
}

function isRevEdit(sub: string): boolean {
  const RE = new Set([
    "sentence structure", "sentence combining", "subject verb agreement",
    "pronoun agreement", "verb tense", "comma usage", "punctuation",
    "usage & grammar", "style word choice", "word choice",
    "organization concluding sentence", "organization logical placement",
    "organization paragraph unity", "organization topic sentence",
    "organization transitions", "text organization",
  ]);
  return RE.has(sub.toLowerCase().replace(/[_-]/g, " ").trim());
}

export interface PDFExportData {
  testName: string;
  date: string;
  duration: number;
  totalCorrect: number;
  totalQuestions: number;
  englishCorrect: number;
  englishTotal: number;
  mathCorrect: number;
  mathTotal: number;
  lang?: "en" | "zh-TW";
  shsatScore?: {
    total: number;
    elaRatio: number;
    mathRatio: number;
    revisingRatio?: number;
    readingRatio?: number;
    labelText: string;
    labelColor: "green" | "amber" | "red";
    subcategories: PDFSubcategory[];
  };
  aiAnalysis?: {
    strengths: string[];
    improvements: string[];
    recommendations: string[];
  };
  questions: Array<{ orderIndex: number; isCorrect: boolean | null; isEnglish: boolean }>;
  studentName?: string;
}

const SCORE_BAND_TW: Record<string, string> = {
  "Top-school competitive range":                   "頂尖學校競爭水準",
  "Competitive range for specialized schools":      "特色學校競爭水準",
  "Approaching competitive — keep going!":          "接近競爭水準，繼續加油！",
  "Keep practicing — you're building real skills!": "持續練習，你正在穩步提升！",
};

const SUBCAT_TW: Record<string, string> = {
  Authors_Perspective: "作者的觀點立場", "Author's Perspective": "作者的觀點立場",
  Authors_Point_of_View: "作者的敘述視角", "Author's Point of View": "作者的敘述視角",
  Authors_Purpose: "作者的寫作目的", "Author's Purpose": "作者的寫作目的",
  "Author's Purpose & Tone": "作者目的與語氣", Authors_Purpose_and_Tone: "作者目的與語氣",
  Central_Idea: "中心思想", "Central Idea": "中心思想",
  Comma_Usage: "逗號用法", "Comma Usage": "逗號用法",
  Figurative_Language: "修辭手法", "Figurative Language": "修辭手法",
  Inference: "推理",
  Inference_and_Implied_Ideas: "推理與隱含含義", "Inference and Implied Ideas": "推理與隱含含義",
  Main_Idea: "段落主旨", "Main Idea": "段落主旨",
  "Organization-Concluding_Sentence": "段落組織：結尾句",
  "Organization-Logical_Placement": "段落組織：邏輯排列",
  "Organization-Paragraph_Unity": "段落組織：段落統一",
  "Organization-Topic_Sentence": "段落組織：主題句",
  "Organization-Transitions": "段落組織：過渡語",
  Plot_Development: "情節發展", "Plot Development": "情節發展",
  Poetic_Technique: "詩歌技巧", "Poetic Technique": "詩歌技巧",
  Point_of_View: "敘述視角", "Point of View": "敘述視角",
  Pronoun_Agreement: "代詞一致性", "Pronoun Agreement": "代詞一致性",
  Punctuation: "標點符號",
  Sentence_Combining: "句子合併", "Sentence Combining": "句子合併",
  Sentence_Structure: "句子結構", "Sentence Structure": "句子結構",
  Setting: "場景與背景",
  "Style-Word_Choice": "寫作風格：用詞選擇",
  "Subject-Verb_Agreement": "主謂一致性", "Subject Verb Agreement": "主謂一致性",
  Summarization: "文章概括",
  Supporting_Details: "支持性細節", "Supporting Details": "支持性細節",
  Text_Feature: "文本特徵", "Text Feature": "文本特徵",
  Text_Organization: "文章組織", "Text Organization": "文章組織",
  Text_Structure: "文章結構", "Text Structure": "文章結構",
  Textual_Evidence: "文本依據", "Textual Evidence": "文本依據",
  Textual_Evidence_and_Reasoning: "文本依據與推理", "Textual Evidence and Reasoning": "文本依據與推理",
  Theme: "文章主題", Tone: "文章語氣",
  "Usage_&_Grammar": "語言用法與語法", "Usage & Grammar": "語言用法與語法",
  Verb_Tense: "動詞時態", "Verb Tense": "動詞時態",
  Vocabulary_in_Context: "語境詞彙", "Vocabulary in Context": "語境詞彙",
  Word_Choice: "詞語選擇", "Word Choice": "詞語選擇",
  Algebra_and_Equations: "代數與方程式", "Algebra and Equations": "代數與方程式", "Algebra & Equations": "代數與方程式",
  Algebraic_Expressions: "代數式", "Algebraic Expressions": "代數式",
  Arithmetic: "基礎算術",
  Fraction_Word_Problems: "分數應用題", "Fraction Word Problems": "分數應用題",
  Geometry: "幾何", Inequalities: "不等式",
  "Linear_Eq._Formula": "線性方程式", "Linear Eq. Formula": "線性方程式",
  Percentage: "百分比", Probability: "機率",
  "Rate-Unit_Rate": "速率／單位速率", "Rate / Unit Rate": "速率／單位速率", "Rate/Unit Rate": "速率／單位速率",
  Ratios_and_Proportions: "比例關係", "Ratios and Proportions": "比例關係", "Ratios & Proportions": "比例關係",
  Sequence: "數列規律",
  Stats_and_Data_Analysis: "統計與資料分析", "Stats and Data Analysis": "統計與資料分析", "Stats & Data Analysis": "統計與資料分析",
  Statistics: "統計",
  General: "綜合", Uncategorized: "未分類",
};

function fmtSubEN(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/^Organization-/, "Org: ")
    .replace(/^Style-/, "Style: ")
    .replace(/\bEq\b\.?/g, "Eq.")
    .replace(/\band\b/g, "&");
}

function formatDuration(min: number, zh?: boolean): string {
  if (min === 0) return zh ? "無時限" : "Untimed";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}`.trim() : `${m}m`;
}

function pctNum(correct: number, total: number): number {
  return total > 0 ? Math.round((correct / total) * 100) : 0;
}

function pctStr(correct: number, total: number): string {
  return total > 0 ? `${Math.round((correct / total) * 100)}%` : "—";
}

function subBarWidth(score: number): string {
  return `${Math.round(((score - 200) / 500) * 100)}%`;
}

function buildSubcatSection(
  filtered: PDFSubcategory[],
  label: string,
  accent: string,
  translateSub: (name: string) => string,
): string {
  if (!filtered.length) return "";
  const rows = filtered.map(sub => `
    <div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">
        <span style="color:#374151;">${translateSub(sub.name)}</span>
        <span style="color:#6b7280;font-weight:400;font-size:11px;">(${sub.correct}/${sub.total})</span>
      </div>
      <div style="height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;">
        <div style="height:100%;width:${subBarWidth(sub.score)};background:${accent};border-radius:3px;"></div>
      </div>
    </div>`).join("");
  return `
    <div style="margin-bottom:16px;">
      <p style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px 0;">${label}</p>
      ${rows}
    </div>`;
}

function buildScoreCircle(pct: number, color: string, scoreLabel: string): string {
  const r = 38;
  const cx = 50;
  const cy = 50;
  const circumference = 2 * Math.PI * r;
  const dash = (pct / 100) * circumference;
  return `
    <svg width="100" height="100" viewBox="0 0 100 100" style="flex-shrink:0;">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="12"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="12"
        stroke-dasharray="${dash.toFixed(2)} ${circumference.toFixed(2)}"
        stroke-linecap="round"
        transform="rotate(-90 ${cx} ${cy})"/>
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"
        font-size="19" font-weight="800" fill="#111827"
        font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${pct}%</text>
      <text x="${cx}" y="${cy + 16}" text-anchor="middle"
        font-size="9" fill="#9ca3af"
        font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${scoreLabel}</text>
    </svg>`;
}

function buildHTML(data: PDFExportData): string {
  const zh = data.lang === "zh-TW";
  const overallPct  = pctNum(data.totalCorrect, data.totalQuestions);
  const circleColor = overallPct >= 70 ? "#10b981" : overallPct >= 50 ? "#f59e0b" : "#ef4444";

  const translateSub = (raw: string): string => {
    if (!zh) return fmtSubEN(raw);
    return SUBCAT_TW[raw] ?? SUBCAT_TW[raw.replace(/_/g, " ")] ?? fmtSubEN(raw);
  };

  const L = {
    duration:             zh ? "測試時長"        : "Duration",
    estimatedScore:       zh ? "SHSAT 估算分數"   : "Estimated SHSAT Score",
    diffWeighted:         zh ? "難度加權"         : "Difficulty-weighted",
    revEdit:              zh ? "修改/編輯"        : "Rev/Edit",
    reading:              zh ? "閱讀"            : "Reading",
    math:                 zh ? "數學"            : "Math",
    weighted:             zh ? "加權"            : "weighted",
    englishCombined:      zh ? "英文（綜合）"     : "English (combined)",
    correct:              zh ? "正確"            : "correct",
    incorrect:            zh ? "錯誤"            : "incorrect",
    skipped:              zh ? "未作答"           : "skipped",
    scoreCircleLabel:     zh ? "得分"            : "score",
    aiCoach:              zh ? "AI 教練"         : "AI Coach",
    strengths:            zh ? "優勢"            : "Strengths",
    improvements:         zh ? "待提升方向"       : "Areas to Improve",
    recommendations:      zh ? "學習建議"         : "Study Recommendations",
    questionBreakdown:    zh ? "題目分析"         : "Question Breakdown",
    revisingEditing:      zh ? "修改 / 編輯"      : "Revising / Editing",
    readingComprehension: zh ? "閱讀理解"         : "Reading Comprehension",
    shsatPrep:            zh ? "SHSAT 備考"       : "SHSAT Preparation",
    generated:            zh ? "生成日期"         : "Generated",
    englishQ: (end: number) =>
      zh ? `英文（第1–${end}題）` : `English (Q1&ndash;Q${end})`,
    mathQ: (start: number, end: number) =>
      zh ? `數學（第${start}–${end}題）` : `Math (Q${start}&ndash;Q${end})`,
  };

  // ── SHSAT block ────────────────────────────────────────────────────────────
  let shsatBlock = "";
  if (data.shsatScore) {
    const s = data.shsatScore;
    const totalColor   = s.labelColor === "green" ? "#059669" : s.labelColor === "amber" ? "#d97706" : "#dc2626";
    const bannerBg     = s.labelColor === "green" ? "#ecfdf5" : s.labelColor === "amber" ? "#fffbeb" : "#fef2f2";
    const bannerBorder = s.labelColor === "green" ? "#a7f3d0" : s.labelColor === "amber" ? "#fde68a" : "#fecaca";
    const bannerText   = s.labelColor === "green" ? "#065f46" : s.labelColor === "amber" ? "#92400e" : "#991b1b";
    const displayLabel = zh ? (SCORE_BAND_TW[s.labelText] ?? s.labelText) : s.labelText;
    const revSubs  = s.subcategories.filter(sub => sub.subject === "english" && isRevEdit(sub.name));
    const rcSubs   = s.subcategories.filter(sub => sub.subject === "english" && !isRevEdit(sub.name));
    const mathSubs = s.subcategories.filter(sub => sub.subject === "math");
    const subcatHTML = [
      buildSubcatSection(revSubs,  L.revisingEditing,     "#3b82f6", translateSub),
      buildSubcatSection(rcSubs,   L.readingComprehension,"#0ea5e9", translateSub),
      buildSubcatSection(mathSubs, L.math,                "#8b5cf6", translateSub),
    ].join("");
    shsatBlock = `
      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="font-size:14px;font-weight:700;color:#111827;">${L.estimatedScore}</span>
          <span style="font-size:11px;color:#6b7280;background:#f9fafb;border:1px solid #e5e7eb;padding:3px 10px;border-radius:12px;">${L.diffWeighted}</span>
        </div>
        <div style="text-align:center;margin-bottom:12px;">
          <span style="font-size:52px;font-weight:900;color:${totalColor};">${s.total}</span>
          <span style="font-size:22px;font-weight:700;color:#d1d5db;"> /700</span>
        </div>
        <div style="display:flex;justify-content:center;gap:20px;margin-bottom:12px;">
          <div style="text-align:center;">
            <div style="font-size:11px;color:#9ca3af;">${L.revEdit}</div>
            <div style="font-size:16px;font-weight:700;color:#2563eb;">${Math.round((s.revisingRatio ?? s.elaRatio) * 100)}%</div>
            <div style="font-size:10px;color:#d1d5db;">${L.weighted}</div>
          </div>
          <div style="width:1px;background:#e5e7eb;"></div>
          <div style="text-align:center;">
            <div style="font-size:11px;color:#9ca3af;">${L.reading}</div>
            <div style="font-size:16px;font-weight:700;color:#0284c7;">${Math.round((s.readingRatio ?? s.elaRatio) * 100)}%</div>
            <div style="font-size:10px;color:#d1d5db;">${L.weighted}</div>
          </div>
          <div style="width:1px;background:#e5e7eb;"></div>
          <div style="text-align:center;">
            <div style="font-size:11px;color:#9ca3af;">${L.math}</div>
            <div style="font-size:16px;font-weight:700;color:#7c3aed;">${Math.round(s.mathRatio * 100)}%</div>
            <div style="font-size:10px;color:#d1d5db;">${L.weighted}</div>
          </div>
        </div>
        <div style="text-align:center;background:${bannerBg};border:1px solid ${bannerBorder};color:${bannerText};font-size:12px;font-weight:600;border-radius:8px;padding:8px 12px;${subcatHTML ? "margin-bottom:16px;" : ""}">
          ${displayLabel}
        </div>
        ${subcatHTML ? `<div style="border-top:1px solid #f3f4f6;padding-top:16px;">${subcatHTML}</div>` : ""}
      </div>`;
  }

  // ── AI analysis block ──────────────────────────────────────────────────────
  let aiBlock = "";
  if (data.aiAnalysis) {
    const a = data.aiAnalysis;
    const card = (title: string, items: string[], border: string, bg: string, text: string) =>
      `<div style="border-left:4px solid ${border};background:${bg};border-radius:0 8px 8px 0;padding:12px 14px;margin-bottom:10px;">
        <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${text};margin:0 0 8px 0;">${title}</p>
        <ul style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:5px;">
          ${items.map(item => `<li style="font-size:12px;color:${text};display:flex;gap:8px;"><span style="flex-shrink:0;">›</span><span>${item}</span></li>`).join("")}
        </ul>
      </div>`;
    aiBlock = `
      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
          <div style="width:28px;height:28px;border-radius:50%;background:#2563eb;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <span style="color:white;font-size:14px;line-height:1;">&#9889;</span>
          </div>
          <span style="font-size:14px;font-weight:700;color:#111827;">${L.aiCoach}</span>
        </div>
        ${card(L.strengths,       a.strengths,       "#34d399", "#f0fdf4", "#065f46")}
        ${card(L.improvements,    a.improvements,    "#fbbf24", "#fffbeb", "#92400e")}
        ${card(L.recommendations, a.recommendations, "#60a5fa", "#eff6ff", "#1e40af")}
      </div>`;
  }

  // ── Question grid ──────────────────────────────────────────────────────────
  const correct   = data.questions.filter(q => q.isCorrect === true).length;
  const incorrect = data.questions.filter(q => q.isCorrect === false).length;
  const skipped   = data.totalQuestions - data.questions.length;

  const qCells = Array.from({ length: data.totalQuestions }, (_, i) => {
    const q = data.questions.find(q => q.orderIndex === i + 1);
    const c = q?.isCorrect;
    let bg = "#f3f4f6"; let color = "#9ca3af"; let border = "#e5e7eb";
    if (c === true)  { bg = "#d1fae5"; color = "#059669"; border = "#6ee7b7"; }
    if (c === false) { bg = "#fee2e2"; color = "#dc2626"; border = "#fca5a5"; }
    return `<div style="width:24px;height:24px;border-radius:4px;background:${bg};border:1px solid ${border};color:${color};font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;font-family:monospace;">${i + 1}</div>`;
  }).join("");

  const dateLocale = zh ? "zh-TW" : "en-US";
  const dateStr = new Date().toLocaleDateString(dateLocale, { month: "long", day: "numeric", year: "numeric" });

  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #f3f4f6;">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="font-size:18px;font-weight:800;color:#111827;font-family:'Outfit',sans-serif;letter-spacing:-0.03em;">&#128081; TestQueens</span>
        </div>
        <h1 style="font-size:22px;font-weight:800;color:#111827;margin-bottom:4px;">${data.testName}</h1>
        ${data.studentName ? `<p style="font-size:13px;color:#6b7280;">${data.studentName}</p>` : ""}
        <p style="font-size:12px;color:#9ca3af;">${data.date}</p>
      </div>
      <div style="text-align:right;">
        <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">${L.duration}</div>
        <div style="font-size:16px;font-weight:700;color:#374151;">${formatDuration(data.duration, zh)}</div>
      </div>
    </div>

    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;">
        ${buildScoreCircle(overallPct, circleColor, L.scoreCircleLabel)}
        <div style="flex:1;min-width:180px;display:flex;flex-direction:column;gap:10px;">
          <div>
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
              <span style="font-weight:600;color:#374151;">${L.englishCombined}</span>
              <span style="color:#6b7280;">${data.englishCorrect} / ${data.englishTotal} &middot; ${pctStr(data.englishCorrect, data.englishTotal)}</span>
            </div>
            <div style="height:10px;background:#e5e7eb;border-radius:5px;overflow:hidden;">
              <div style="height:100%;width:${pctNum(data.englishCorrect, data.englishTotal)}%;background:#3b82f6;border-radius:5px;"></div>
            </div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
              <span style="font-weight:600;color:#374151;">${L.math}</span>
              <span style="color:#6b7280;">${data.mathCorrect} / ${data.mathTotal} &middot; ${pctStr(data.mathCorrect, data.mathTotal)}</span>
            </div>
            <div style="height:10px;background:#e5e7eb;border-radius:5px;overflow:hidden;">
              <div style="height:100%;width:${pctNum(data.mathCorrect, data.mathTotal)}%;background:#8b5cf6;border-radius:5px;"></div>
            </div>
          </div>
        </div>
        <div style="display:flex;gap:20px;flex-shrink:0;">
          <div style="text-align:center;">
            <div style="font-size:26px;font-weight:800;color:#111827;">${data.totalCorrect}</div>
            <div style="font-size:11px;color:#9ca3af;">${L.correct}</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:26px;font-weight:800;color:#dc2626;">${data.totalQuestions - data.totalCorrect}</div>
            <div style="font-size:11px;color:#9ca3af;">${L.incorrect}</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:26px;font-weight:800;color:#9ca3af;">${skipped}</div>
            <div style="font-size:11px;color:#9ca3af;">${L.skipped}</div>
          </div>
        </div>
      </div>
    </div>

    ${shsatBlock}
    ${aiBlock}

    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <span style="font-size:14px;font-weight:700;color:#111827;">${L.questionBreakdown}</span>
        <div style="display:flex;gap:12px;font-size:11px;color:#6b7280;">
          <span style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block;"></span>${correct} ${L.correct}</span>
          <span style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:#ef4444;display:inline-block;"></span>${incorrect} ${L.incorrect}</span>
          <span style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:#d1d5db;display:inline-block;"></span>${skipped} ${L.skipped}</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="font-size:11px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:0.05em;">${L.englishQ(data.englishTotal)}</span>
        <div style="flex:1;height:1px;background:#dbeafe;"></div>
        <span style="font-size:11px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.05em;">${L.mathQ(data.englishTotal + 1, data.totalQuestions)}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;">
        ${qCells}
      </div>
    </div>

    <div style="margin-top:24px;padding-top:12px;border-top:1px solid #f3f4f6;display:flex;justify-content:space-between;font-size:11px;color:#9ca3af;">
      <span style="font-family:'Outfit',sans-serif;font-weight:700;letter-spacing:-0.02em;">TestQueens</span> &middot; ${L.shsatPrep}
      <span>${L.generated} ${dateStr}</span>
    </div>`;
}

export async function exportResultsPDF(data: PDFExportData): Promise<void> {
  const container = document.createElement("div");
  container.style.cssText = [
    "position:fixed",
    "left:-9999px",
    "top:0",
    "width:794px",
    "background:white",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "font-size:13px",
    "color:#111827",
    "padding:32px 40px",
    "box-sizing:border-box",
  ].join(";");
  container.innerHTML = buildHTML(data);
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: 794,
    });

    const pdf         = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth   = pdf.internal.pageSize.getWidth();
    const pageHeight  = pdf.internal.pageSize.getHeight();
    const imgData     = canvas.toDataURL("image/jpeg", 0.92);
    const imgHeightMm = (canvas.height * pageWidth) / canvas.width;

    let y = 0;
    while (y < imgHeightMm) {
      if (y > 0) pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, -y, pageWidth, imgHeightMm);
      y += pageHeight;
    }

    const safeName = data.testName.replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "results";
    const langSuffix = data.lang === "zh-TW" ? " Chinese" : "";
    pdf.save(`${safeName} - Results${langSuffix}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}
