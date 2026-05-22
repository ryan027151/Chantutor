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

function formatDuration(min: number): string {
  if (min === 0) return "Untimed";
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

function scoreColor(score: number): string {
  if (score >= 580) return "#059669";
  if (score >= 450) return "#d97706";
  return "#dc2626";
}

function subBarWidth(score: number): string {
  return `${Math.round(((score - 200) / 500) * 100)}%`;
}

function buildSubcatSection(filtered: PDFSubcategory[], label: string, accent: string): string {
  if (!filtered.length) return "";
  const rows = filtered.map(sub => `
    <div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">
        <span style="color:#374151;">${sub.name}</span>
        <span style="color:${scoreColor(sub.score)};font-weight:700;">${sub.score}
          <span style="color:#9ca3af;font-weight:400;"> /700</span>
          <span style="color:#6b7280;font-weight:400;font-size:11px;"> (${sub.correct}/${sub.total})</span>
        </span>
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

// SVG arc instead of conic-gradient — html2canvas renders SVG reliably
function buildScoreCircle(pct: number, color: string): string {
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
        font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">score</text>
    </svg>`;
}

function buildHTML(data: PDFExportData): string {
  const overallPct  = pctNum(data.totalCorrect, data.totalQuestions);
  const circleColor = overallPct >= 70 ? "#10b981" : overallPct >= 50 ? "#f59e0b" : "#ef4444";

  // ── SHSAT block ────────────────────────────────────────────────────────────
  let shsatBlock = "";
  if (data.shsatScore) {
    const s = data.shsatScore;
    const totalColor   = s.labelColor === "green" ? "#059669" : s.labelColor === "amber" ? "#d97706" : "#dc2626";
    const bannerBg     = s.labelColor === "green" ? "#ecfdf5" : s.labelColor === "amber" ? "#fffbeb" : "#fef2f2";
    const bannerBorder = s.labelColor === "green" ? "#a7f3d0" : s.labelColor === "amber" ? "#fde68a" : "#fecaca";
    const bannerText   = s.labelColor === "green" ? "#065f46" : s.labelColor === "amber" ? "#92400e" : "#991b1b";
    const revSubs  = s.subcategories.filter(sub => sub.subject === "english" && isRevEdit(sub.name));
    const rcSubs   = s.subcategories.filter(sub => sub.subject === "english" && !isRevEdit(sub.name));
    const mathSubs = s.subcategories.filter(sub => sub.subject === "math");
    const subcatHTML = [
      buildSubcatSection(revSubs,  "Revising / Editing",    "#3b82f6"),
      buildSubcatSection(rcSubs,   "Reading Comprehension", "#0ea5e9"),
      buildSubcatSection(mathSubs, "Math",                  "#8b5cf6"),
    ].join("");
    shsatBlock = `
      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="font-size:14px;font-weight:700;color:#111827;">Estimated SHSAT Score</span>
          <span style="font-size:11px;color:#6b7280;background:#f9fafb;border:1px solid #e5e7eb;padding:3px 10px;border-radius:12px;">Difficulty-weighted</span>
        </div>
        <div style="text-align:center;margin-bottom:12px;">
          <span style="font-size:52px;font-weight:900;color:${totalColor};">${s.total}</span>
          <span style="font-size:22px;font-weight:700;color:#d1d5db;"> /700</span>
        </div>
        <div style="display:flex;justify-content:center;gap:20px;margin-bottom:12px;">
          <div style="text-align:center;">
            <div style="font-size:11px;color:#9ca3af;">Rev/Edit</div>
            <div style="font-size:16px;font-weight:700;color:#2563eb;">${Math.round((s.revisingRatio ?? s.elaRatio) * 100)}%</div>
            <div style="font-size:10px;color:#d1d5db;">weighted</div>
          </div>
          <div style="width:1px;background:#e5e7eb;"></div>
          <div style="text-align:center;">
            <div style="font-size:11px;color:#9ca3af;">Reading</div>
            <div style="font-size:16px;font-weight:700;color:#0284c7;">${Math.round((s.readingRatio ?? s.elaRatio) * 100)}%</div>
            <div style="font-size:10px;color:#d1d5db;">weighted</div>
          </div>
          <div style="width:1px;background:#e5e7eb;"></div>
          <div style="text-align:center;">
            <div style="font-size:11px;color:#9ca3af;">Math</div>
            <div style="font-size:16px;font-weight:700;color:#7c3aed;">${Math.round(s.mathRatio * 100)}%</div>
            <div style="font-size:10px;color:#d1d5db;">weighted</div>
          </div>
        </div>
        <div style="text-align:center;background:${bannerBg};border:1px solid ${bannerBorder};color:${bannerText};font-size:12px;font-weight:600;border-radius:8px;padding:8px 12px;${subcatHTML ? "margin-bottom:16px;" : ""}">
          ${s.labelText}
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
          <span style="font-size:14px;font-weight:700;color:#111827;">AI Coach</span>
        </div>
        ${card("Strengths",             a.strengths,       "#34d399", "#f0fdf4", "#065f46")}
        ${card("Areas to Improve",      a.improvements,    "#fbbf24", "#fffbeb", "#92400e")}
        ${card("Study Recommendations", a.recommendations, "#60a5fa", "#eff6ff", "#1e40af")}
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

  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #f3f4f6;">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="font-size:16px;font-weight:800;color:#111827;">&#128081; Chan Tutoring</span>
        </div>
        <h1 style="font-size:22px;font-weight:800;color:#111827;margin-bottom:4px;">${data.testName}</h1>
        ${data.studentName ? `<p style="font-size:13px;color:#6b7280;">${data.studentName}</p>` : ""}
        <p style="font-size:12px;color:#9ca3af;">${data.date}</p>
      </div>
      <div style="text-align:right;">
        <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">Duration</div>
        <div style="font-size:16px;font-weight:700;color:#374151;">${formatDuration(data.duration)}</div>
      </div>
    </div>

    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;">
        ${buildScoreCircle(overallPct, circleColor)}
        <div style="flex:1;min-width:180px;display:flex;flex-direction:column;gap:10px;">
          <div>
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
              <span style="font-weight:600;color:#374151;">English (combined)</span>
              <span style="color:#6b7280;">${data.englishCorrect} / ${data.englishTotal} &middot; ${pctStr(data.englishCorrect, data.englishTotal)}</span>
            </div>
            <div style="height:10px;background:#e5e7eb;border-radius:5px;overflow:hidden;">
              <div style="height:100%;width:${pctNum(data.englishCorrect, data.englishTotal)}%;background:#3b82f6;border-radius:5px;"></div>
            </div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
              <span style="font-weight:600;color:#374151;">Math</span>
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
            <div style="font-size:11px;color:#9ca3af;">correct</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:26px;font-weight:800;color:#dc2626;">${data.totalQuestions - data.totalCorrect}</div>
            <div style="font-size:11px;color:#9ca3af;">incorrect</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:26px;font-weight:800;color:#9ca3af;">${skipped}</div>
            <div style="font-size:11px;color:#9ca3af;">skipped</div>
          </div>
        </div>
      </div>
    </div>

    ${shsatBlock}
    ${aiBlock}

    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <span style="font-size:14px;font-weight:700;color:#111827;">Question Breakdown</span>
        <div style="display:flex;gap:12px;font-size:11px;color:#6b7280;">
          <span style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block;"></span>${correct} correct</span>
          <span style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:#ef4444;display:inline-block;"></span>${incorrect} incorrect</span>
          <span style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:#d1d5db;display:inline-block;"></span>${skipped} skipped</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="font-size:11px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:0.05em;">English (Q1&ndash;Q${data.englishTotal})</span>
        <div style="flex:1;height:1px;background:#dbeafe;"></div>
        <span style="font-size:11px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.05em;">Math (Q${data.englishTotal + 1}&ndash;Q${data.totalQuestions})</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;">
        ${qCells}
      </div>
    </div>

    <div style="margin-top:24px;padding-top:12px;border-top:1px solid #f3f4f6;display:flex;justify-content:space-between;font-size:11px;color:#9ca3af;">
      <span>Chan Tutoring &middot; SHSAT Preparation</span>
      <span>Generated ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
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
    pdf.save(`${safeName} - Results.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}
