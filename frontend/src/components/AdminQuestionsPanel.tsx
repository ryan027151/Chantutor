import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabase-client";
import { parseFormattedText } from "../utils/textParser";
import ExpressionEditorQuestion from "./ExpressionEditorQuestion";
import NumberLineClick from "./NumberLineClick";
import TableRowRadio from "./TableRowRadio";
import SHSATGrapher from "./SHSATGrapher";
import InlineDropdownQuestion from "./InlineDropdownQuestion";
import MCQuestion from "./multiQuestion";
import MultiSelectQuestion from "./MultiSelectQuestion";
import GridInQuestion from "./gridInQuestion";
import DragFillSingle from "./DragFillSingle";
import DragFillMultiple from "./DragFillMultiple";
import DragToBin from "./DragToBin";
import DragToCategorize from "./DragToCategorize";
import PassageSentenceSelect from "./PassageSentenceSelect";
import InlineTextSpanClick from "./InlineTextSpanClick";

type MediaType = "passage" | "graph" | "table" | "equation";
type QuestionType = "mcq" | "grid-in" | "linear_graphing" | "multi-select" | "expression" | "inline-dropdown" | "number_line_click" | "table_row_radio" | "drag_fill_single" | "drag_fill_multiple" | "drag_to_bin" | "drag_to_categorize" | "in_passage_sentence_select" | "inline_text_span_click";

interface MediaItem {
  mediaId: string;
  media_type: MediaType;
  file: File | null;
  passageText: string;
  previewUrl: string;
  isExisting: boolean;
  // original DB values — set when loading existing media, used to detect changes
  _origId?: string;
  _origType?: MediaType;
  _origContent?: string;
}

const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  passage: "Passage (text)",
  graph: "Graph (image)",
  table: "Table (image)",
  equation: "Equation (image)",
};

function isImageType(t: MediaType) { return t !== "passage"; }

interface Question {
  uid: string;
  type: QuestionType;
  text: string;
  choice_1?: string;
  choice_2?: string;
  choice_3?: string;
  choice_4?: string;
  answer: string;
  subject?: string;
  sub_category?: string;
  difficulty?: string;
  media_refs?: string;
  source?: string;
  status?: string;
  extra_data?: Record<string, unknown> | null;
}

// Virtual fields choice_5, choice_6, select_count, variables, nl_* are serialized into extra_data on save
type FormData = Partial<Question> & {
  choice_5?: string;
  choice_6?: string;
  select_count?: number | string;
  variables?: string; // comma-separated, e.g. "x, n" — only for expression type
  nl_min?: string;       // number_line_click: left bound
  nl_max?: string;       // number_line_click: right bound
  nl_step?: string;      // number_line_click: snap increment
  tr_col_headers?: string; // table_row_radio: comma-separated column headers
  tr_rows?: string;        // table_row_radio: newline-separated row labels
  df_items?: string;       // drag_to_bin/categorize: newline-separated item chips
  df_bins?: string;        // drag_to_bin/categorize: comma-separated bin/category labels
  pss_sentences?: string;  // in_passage_sentence_select: newline-separated sentences
  span_passage?: string;   // inline_text_span_click: passage text with [SPAN_A]...[/SPAN_A] markers
};

const PAGE_SIZE = 30;

const EMPTY_FORM: FormData = {
  uid: "",
  type: "mcq",
  subject: "english",
  sub_category: "",
  difficulty: "",
  text: "",
  choice_1: "",
  choice_2: "",
  choice_3: "",
  choice_4: "",
  choice_5: "",
  choice_6: "",
  select_count: "",
  variables: "",
  answer: "",
  media_refs: "",
  nl_min:  "-10",
  nl_max:  "10",
  nl_step: "1",
  tr_col_headers: "",
  tr_rows: "",
  df_items: "",
  df_bins: "",
  pss_sentences: "",
  span_passage: "",
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold uppercase tracking-widest text-zinc-500">{children}</span>
    </label>
  );
}

function Input({
  value, onChange, placeholder, disabled, mono, autoFocus,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  disabled?: boolean; mono?: boolean; autoFocus?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      className={`w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-base text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${mono ? "font-mono" : ""}`}
    />
  );
}

function Textarea({
  value, onChange, placeholder, rows,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows ?? 5}
      className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-base text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/25 transition-colors resize-y"
    />
  );
}

function Select({
  value, onChange, title, children,
}: {
  value: string; onChange: (v: string) => void; title: string; children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      title={title}
      className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-base text-zinc-900 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/25 transition-colors"
    >
      {children}
    </select>
  );
}

// ── Preview helpers ────────────────────────────────────────────────────────────

function previewExtractLetter(text: string | undefined, fallback: string): string {
  if (!text) return fallback;
  const m = text.match(/^([A-Ha-h])[).:\s]/);
  return m ? m[1].toUpperCase() : fallback;
}

function previewStripPrefix(text: string): string {
  return text.replace(/^[A-Ha-h][).:\s]\s*/, "");
}

function checkPreviewAnswer(type: QuestionType, student: string, correct: string): boolean | null {
  if (!student.trim() || !correct.trim()) return null;
  const s = student.trim(), c = correct.trim();
  if (type === "mcq" || type === "inline-dropdown") return s.toUpperCase() === c.toUpperCase();
  if (type === "multi-select") {
    const norm = (x: string) => x.split(",").map(t => t.trim().toUpperCase()).filter(Boolean).sort().join(",");
    return norm(s) === norm(c);
  }
  if (type === "grid-in") {
    const parseFrac = (str: string) => { const m = str.match(/^(-?\d+)\s*\/\s*(\d+)$/); return m ? parseInt(m[1]) / parseInt(m[2]) : parseFloat(str); };
    const sv = parseFrac(s), cv = parseFrac(c);
    return isFinite(sv) && isFinite(cv) && Math.abs(sv - cv) < 0.0001;
  }
  if (type === "number_line_click") {
    const sv = parseFloat(s), cv = parseFloat(c);
    return isFinite(sv) && isFinite(cv) && Math.abs(sv - cv) < 0.0001;
  }
  if (type === "table_row_radio" || type === "drag_fill_multiple" || type === "drag_to_bin" || type === "drag_to_categorize") {
    const norm = (x: string) => x.split(",").map(t => t.trim().toUpperCase()).join(",");
    return norm(s) === norm(c);
  }
  if (type === "drag_fill_single") return s.toUpperCase() === c.toUpperCase();
  if (type === "inline_text_span_click") return s.toUpperCase() === c.toUpperCase();
  if (type === "in_passage_sentence_select") return s.trim() === c.trim();
  return s === c; // linear_graphing, expression
}

// ── Type badge helper ──────────────────────────────────────────────────────────

function TypeBadge({ type, source }: { type: string; source?: string }) {
  const label =
    type === "mcq"              ? "MCQ" :
    type === "grid-in"          ? "Grid-in" :
    type === "linear_graphing"  ? "Graphing" :
    type === "multi-select"     ? "Multi-select" :
    type === "expression"       ? "Expression" :
    type === "inline-dropdown"  ? "Inline Dropdown" :
    type === "number_line_click"? "Number Line" :
    type === "table_row_radio"  ? "Table Radio" :
    type === "drag_fill_single" ? "Drag Fill" :
    type === "drag_fill_multiple" ? "Drag Fill ×N" :
    type === "drag_to_bin" ? "Drag to Bin" :
    type === "drag_to_categorize" ? "Categorize" :
    type === "in_passage_sentence_select" ? "Sentence Select" :
    type === "inline_text_span_click" ? "Span Click" : type;
  const cls =
    type === "mcq"               ? "bg-zinc-100 text-zinc-500" :
    type === "grid-in"           ? "bg-amber-500/10 text-amber-500" :
    type === "multi-select"      ? "bg-indigo-500/10 text-indigo-600" :
    type === "expression"        ? "bg-teal-500/10 text-teal-600" :
    type === "inline-dropdown"   ? "bg-rose-500/10 text-rose-600" :
    type === "number_line_click" ? "bg-cyan-500/10 text-cyan-600" :
    type === "table_row_radio"   ? "bg-violet-500/10 text-violet-600" :
    type === "drag_fill_single"  ? "bg-orange-500/10 text-orange-600" :
    type === "drag_fill_multiple"? "bg-fuchsia-500/10 text-fuchsia-600" :
    type === "drag_to_bin"       ? "bg-lime-500/10 text-lime-700" :
    type === "drag_to_categorize"? "bg-sky-500/10 text-sky-700" :
    type === "in_passage_sentence_select" ? "bg-teal-500/10 text-teal-700" :
    type === "inline_text_span_click" ? "bg-violet-500/10 text-violet-700" :
    "bg-blue-500/10 text-blue-600";
  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
      {source === "ai" && (
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-600">AI</span>
      )}
    </div>
  );
}

// ── Generate AI Questions modal ────────────────────────────────────────────────

interface GenerateModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const GEN_TYPE_OPTS: { id: string; type: string; subject: string; label: string }[] = [
  // Math types
  { id: "mcq_math",               type: "mcq",               subject: "math",    label: "Math MCQ"         },
  { id: "grid-in",                type: "grid-in",           subject: "math",    label: "Grid-in"          },
  { id: "linear_graphing",        type: "linear_graphing",   subject: "math",    label: "Graphing"         },
  { id: "multi-select_math",      type: "multi-select",      subject: "math",    label: "Multi-select"     },
  { id: "expression",             type: "expression",        subject: "math",    label: "Expression"       },
  { id: "number_line_click",      type: "number_line_click", subject: "math",    label: "Number Line"      },
  { id: "table_row_radio_math",   type: "table_row_radio",   subject: "math",    label: "Table (Math)"     },
  // ELA types
  { id: "inline-dropdown",        type: "inline-dropdown",    subject: "english", label: "Inline Dropdown"   },
  { id: "mcq_english",            type: "mcq",                subject: "english", label: "ELA MCQ"           },
  { id: "multi-select_english",   type: "multi-select",       subject: "english", label: "ELA Multi-select"  },
  { id: "table_row_radio_english",type: "table_row_radio",    subject: "english", label: "ELA Table"         },
  { id: "drag_fill_single_math",  type: "drag_fill_single",   subject: "math",    label: "Drag Fill (Math)"  },
  { id: "drag_fill_single_eng",   type: "drag_fill_single",   subject: "english", label: "Drag Fill (ELA)"   },
  { id: "drag_fill_multiple_math",type: "drag_fill_multiple", subject: "math",    label: "Drag ×N (Math)"    },
  { id: "drag_fill_multiple_eng", type: "drag_fill_multiple", subject: "english", label: "Drag ×N (ELA)"     },
  { id: "drag_to_bin_math",       type: "drag_to_bin",        subject: "math",    label: "Drag to Bin"       },
  { id: "drag_to_cat_math",       type: "drag_to_categorize", subject: "math",    label: "Categorize (Math)" },
  { id: "drag_to_cat_eng",        type: "drag_to_categorize",       subject: "english", label: "Categorize (ELA)"  },
  { id: "inline_text_span_eng",   type: "inline_text_span_click",   subject: "english", label: "Span Click (ELA)"  },
];

const GEN_CATEGORY_OPTS = [
  // Math subcategories
  { value: "Arithmetic",               label: "Arithmetic",           group: "math" },
  { value: "Algebra_and_Equations",    label: "Algebra & Equations",  group: "math" },
  { value: "Algebraic_Expressions",    label: "Algebraic Expr.",      group: "math" },
  { value: "Geometry",                 label: "Geometry",             group: "math" },
  { value: "Fraction_Word_Problems",   label: "Fractions",            group: "math" },
  { value: "Percentage",               label: "Percentage",           group: "math" },
  { value: "Ratios_and_Proportions",   label: "Ratios & Proportions", group: "math" },
  { value: "Probability",              label: "Probability",          group: "math" },
  { value: "Stats_and_Data_Analysis",  label: "Stats & Data",         group: "math" },
  { value: "Sequence",                 label: "Sequence",             group: "math" },
  { value: "Inequalities",             label: "Inequalities",         group: "math" },
  { value: "Linear_Eq._Formula",       label: "Linear Formula",       group: "math" },
  // ELA subcategories
  { value: "Vocabulary_in_Context",    label: "Vocabulary",           group: "english" },
  { value: "Grammar_and_Usage",        label: "Grammar",              group: "english" },
];

function toggle(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];
}

function GenerateModal({ onClose, onSuccess }: GenerateModalProps) {
  const [genTypes, setGenTypes]             = useState<string[]>([]);   // empty = any (random)
  const [genCategories, setGenCategories]   = useState<string[]>([]);   // empty = all categories
  const [genDifficulties, setGenDifficulties] = useState<string[]>([]); // empty = mixed
  const [genCount, setGenCount]             = useState(10);
  const [genChoiceCount, setGenChoiceCount] = useState<4 | 5 | 6>(5);
  const [generating, setGenerating]         = useState(false);
  const [result, setResult]                 = useState<{ generated: number; approved: number; pending: number; duplicates_skipped: number } | null>(null);
  const [genError, setGenError]             = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setGenError(null);
    setResult(null);

    // Types to generate: if none selected, pick one random type
    const typePool = GEN_TYPE_OPTS.map(t => t.id);
    const typesToGenerate = genTypes.length > 0
      ? genTypes
      : [typePool[Math.floor(Math.random() * typePool.length)]];

    // Distribute count evenly across types
    const base  = Math.floor(genCount / typesToGenerate.length);
    const extra = genCount - base * typesToGenerate.length;

    let totalGenerated = 0, totalApproved = 0, totalPending = 0, totalSkipped = 0;

    for (let i = 0; i < typesToGenerate.length; i++) {
      const id        = typesToGenerate[i];
      const opt       = GEN_TYPE_OPTS.find(o => o.id === id)!;
      const type      = opt.type;
      const subject   = opt.subject;
      const thisCount = base + (i < extra ? 1 : 0);
      const body: Record<string, unknown> = {
        type,
        subject,
        count:        thisCount,
        difficulties: genDifficulties,
        categories:   genCategories,
      };
      if (type === "multi-select") body.choice_count = genChoiceCount;

      const { data, error } = await supabase.functions.invoke("generate-questions", { body });
      if (error || data?.error) {
        setGenError(data?.error ?? error?.message ?? "Unknown error");
        setGenerating(false);
        return;
      }
      totalGenerated += data.generated          ?? 0;
      totalApproved  += data.approved ?? data.generated ?? 0;
      totalPending   += data.pending            ?? 0;
      totalSkipped   += data.duplicates_skipped ?? 0;
    }

    setGenerating(false);
    setResult({ generated: totalGenerated, approved: totalApproved, pending: totalPending, duplicates_skipped: totalSkipped });
    onSuccess();
  }

  // Cost estimate: graphing is slightly cheaper; average across selected (or all) types
  const estimatedIds = genTypes.length > 0 ? genTypes : GEN_TYPE_OPTS.map(t => t.id);
  const avgCost = estimatedIds.reduce((s, id) => {
    const opt = GEN_TYPE_OPTS.find(o => o.id === id);
    return s + (opt?.type === "linear_graphing" ? 0.03 : 0.04);
  }, 0) / estimatedIds.length;
  const estimatedCost = (genCount * avgCost).toFixed(2);

  function SectionLabel({ children, anyLabel }: { children: string; anyLabel: string }) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold uppercase tracking-widest text-zinc-500">{children}</span>
        <span className="text-xs font-semibold text-amber-500 normal-case">{anyLabel}</span>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-zinc-200 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-lg font-bold text-zinc-900">Generate AI Questions</h3>
            <p className="text-sm text-zinc-400 mt-0.5">Uses Claude to write SHSAT-style math and ELA questions</p>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors text-base">
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="p-6 flex flex-col gap-5 overflow-y-auto">
          {result ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-base font-semibold text-zinc-800">
                Generated {result.generated} question{result.generated !== 1 ? "s" : ""}
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700">
                  {result.approved} approved
                </span>
                {result.pending > 0 && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700">
                    {result.pending} need review
                  </span>
                )}
                {result.duplicates_skipped > 0 && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">
                    {result.duplicates_skipped} duplicate{result.duplicates_skipped !== 1 ? "s" : ""} skipped
                  </span>
                )}
              </div>
              {result.pending > 0 && (
                <p className="text-xs text-zinc-400 text-center">
                  Questions marked "Pending" were flagged by the AI as possibly incorrect. Review them in the question bank.
                </p>
              )}
              {result.duplicates_skipped > 0 && (
                <p className="text-xs text-zinc-400 text-center">
                  {result.duplicates_skipped} question{result.duplicates_skipped !== 1 ? "s were" : " was"} identical to existing questions and not added.
                </p>
              )}
              <button type="button" onClick={onClose}
                className="mt-2 px-6 py-2 rounded-lg text-base font-bold bg-zinc-900 text-white hover:bg-zinc-700 transition-colors">
                Done
              </button>
            </div>
          ) : (
            <>
              {/* ── Question type (multi-select) ─────────────────────── */}
              <div className="flex flex-col gap-1.5">
                <SectionLabel anyLabel={genTypes.length === 0 ? "· Any (random)" : ""}>Question Type</SectionLabel>
                <div className="flex flex-col gap-2">
                  <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Math</div>
                  <div className="grid grid-cols-2 gap-2">
                    {GEN_TYPE_OPTS.filter(o => o.subject === "math").map(opt => {
                      const active = genTypes.includes(opt.id);
                      return (
                        <button key={opt.id} type="button"
                          onClick={() => setGenTypes(toggle(genTypes, opt.id))}
                          className={`py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                            active
                              ? "bg-amber-500 border-amber-400 text-zinc-950"
                              : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:border-amber-500/40"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mt-1">ELA</div>
                  <div className="grid grid-cols-2 gap-2">
                    {GEN_TYPE_OPTS.filter(o => o.subject === "english").map(opt => {
                      const active = genTypes.includes(opt.id);
                      return (
                        <button key={opt.id} type="button"
                          onClick={() => setGenTypes(toggle(genTypes, opt.id))}
                          className={`py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                            active
                              ? "bg-blue-500 border-blue-400 text-white"
                              : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:border-blue-500/40"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ── Choices per question — multi-select type only ────── */}
              {genTypes.some(id => id.startsWith("multi-select")) && (
                <div className="flex flex-col gap-1.5">
                  <Label>Choices per question</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {([4, 5, 6] as (4 | 5 | 6)[]).map(n => (
                      <button key={n} type="button"
                        onClick={() => setGenChoiceCount(n)}
                        className={`py-2 rounded-xl border text-sm font-bold transition-all ${
                          genChoiceCount === n
                            ? "bg-amber-500 border-amber-400 text-zinc-950"
                            : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:border-amber-500/40"
                        }`}
                      >
                        {n} choices
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Category (multi-select) ──────────────────────────── */}
              <div className="flex flex-col gap-1.5">
                <SectionLabel anyLabel={genCategories.length === 0 ? "· All categories" : ""}>Category</SectionLabel>
                {/* Math subcategories */}
                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Math</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {GEN_CATEGORY_OPTS.filter(c => c.group === "math").map(cat => {
                    const active = genCategories.includes(cat.value);
                    return (
                      <button key={cat.value} type="button"
                        onClick={() => setGenCategories(toggle(genCategories, cat.value))}
                        className={`py-2 px-1.5 rounded-xl border text-xs font-semibold text-center leading-tight transition-all ${
                          active
                            ? "bg-amber-500 border-amber-400 text-zinc-950"
                            : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:border-amber-500/40"
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
                {/* ELA subcategories */}
                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mt-1">ELA</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {GEN_CATEGORY_OPTS.filter(c => c.group === "english").map(cat => {
                    const active = genCategories.includes(cat.value);
                    return (
                      <button key={cat.value} type="button"
                        onClick={() => setGenCategories(toggle(genCategories, cat.value))}
                        className={`py-2 px-1.5 rounded-xl border text-xs font-semibold text-center leading-tight transition-all ${
                          active
                            ? "bg-blue-500 border-blue-400 text-white"
                            : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:border-blue-500/40"
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── How many questions ───────────────────────────────── */}
              <div className="flex flex-col gap-1.5">
                <Label>How many questions?</Label>
                <div className="grid grid-cols-4 gap-2">
                  {[5, 10, 15, 20].map(n => (
                    <button key={n} type="button"
                      onClick={() => setGenCount(n)}
                      className={`py-2 rounded-xl border text-sm font-bold transition-all ${
                        genCount === n
                          ? "bg-amber-500 border-amber-400 text-zinc-950"
                          : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:border-amber-500/40"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Difficulty (multi-select) ────────────────────────── */}
              <div className="flex flex-col gap-1.5">
                <SectionLabel anyLabel={genDifficulties.length === 0 ? "· Mixed" : ""}>Difficulty</SectionLabel>
                <div className="grid grid-cols-3 gap-2">
                  {["easy", "medium", "hard"].map(d => {
                    const active = genDifficulties.includes(d);
                    return (
                      <button key={d} type="button"
                        onClick={() => setGenDifficulties(toggle(genDifficulties, d))}
                        className={`py-2 rounded-xl border text-sm font-bold capitalize transition-all ${
                          active
                            ? "bg-amber-500 border-amber-400 text-zinc-950"
                            : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:border-amber-500/40"
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Cost estimate */}
              <p className="text-xs text-zinc-400 bg-zinc-50 border border-zinc-100 rounded-lg px-3 py-2">
                Estimated cost: ~${estimatedCost} USD using Claude Opus
                {genTypes.length > 1 && ` (${genTypes.length} type passes)`}
              </p>

              {genError && (
                <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{genError}</p>
              )}
            </>
          )}
        </div>

        {!result && (
          <div className="px-6 py-4 border-t border-zinc-200 flex items-center justify-between shrink-0">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg text-base text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={generate} disabled={generating}
              className="px-6 py-2 rounded-lg text-base font-bold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-colors disabled:opacity-50 flex items-center gap-2">
              {generating && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {generating ? "Generating…" : `Generate ${genCount} Questions`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

interface AdminQuestionsPanelProps {
  initialEditUid?: string | null;
  initialReportId?: string | null;
  onEditHandled?: () => void;
  onReturnToReports?: () => void;
}

export default function AdminQuestionsPanel({ initialEditUid, initialReportId, onEditHandled, onReturnToReports }: AdminQuestionsPanelProps = {}) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [pendingCount, setPendingCount] = useState(0);

  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [originalSubCategory, setOriginalSubCategory] = useState<string | null>(null);
  const [isNewTopic, setIsNewTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [originalForm, setOriginalForm] = useState<FormData | null>(null);
  const [previewAnswer, setPreviewAnswer] = useState<string>("");
  const [previewResetKey, setPreviewResetKey] = useState(0);
  const [showPreview, setShowPreview] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null);
  const [deleting, setDeleting] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearchChange(v: string) {
    setSearchInput(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(v); setPage(0); }, 400);
  }

  useEffect(() => {
    supabase.from("all_questions").select("sub_category").then(({ data }) => {
      if (!data) return;
      const unique = [...new Set(
        data.map((r: { sub_category: string | null }) => r.sub_category).filter(Boolean)
      )].sort() as string[];
      setCategories(unique);
    });
  }, []);

  const fetchPendingCount = useCallback(async () => {
    const { count } = await supabase
      .from("all_questions")
      .select("uid", { count: "exact", head: true })
      .eq("status", "pending");
    setPendingCount(count ?? 0);
  }, []);

  const fetchQuestions = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setFetchError(null);
    let q = supabase
      .from("all_questions")
      .select(
        "uid, type, text, choice_1, choice_2, choice_3, choice_4, answer, subject, sub_category, difficulty, media_refs, source, status, extra_data",
        { count: "exact" }
      )
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (filterSubject)  q = q.eq("subject", filterSubject);
    if (filterType)     q = q.eq("type", filterType);
    if (filterCategory) q = q.eq("sub_category", filterCategory);
    if (filterSource)   q = q.eq("source", filterSource);
    if (filterStatus)   q = q.eq("status", filterStatus);
    if (search.trim())  q = q.or(`uid.ilike.%${search.trim()}%,text.ilike.%${search.trim()}%`);

    const { data, count, error } = await q;
    if (error) {
      setFetchError(error.message);
    } else {
      const sorted = (data as Question[] ?? []).sort((a, b) => {
        const aNum = a.uid.match(/^ai_Q(\d+)$/);
        const bNum = b.uid.match(/^ai_Q(\d+)$/);
        if (aNum && bNum) return parseInt(aNum[1]) - parseInt(bNum[1]);
        if (aNum) return 1;   // AI questions after bank questions
        if (bNum) return -1;
        return a.uid.localeCompare(b.uid);
      });
      setQuestions(sorted);
      setTotal(count ?? 0);
    }
    setLoading(false);
    fetchPendingCount();
  }, [page, filterSubject, filterType, filterCategory, filterSource, filterStatus, search, fetchPendingCount]);

  async function approveQuestion(uid: string) {
    const { data, error } = await supabase
      .from("all_questions")
      .update({ status: "approved" })
      .eq("uid", uid)
      .select("uid");
    if (error) { setFetchError(`Approve failed: ${error.message}`); return; }
    if (!data || data.length === 0) { setFetchError("Approve blocked by RLS — run admin_rls_policies.sql in Supabase SQL Editor."); return; }
    fetchQuestions();
  }

  async function rejectQuestion(uid: string) {
    const { data, error } = await supabase
      .from("all_questions")
      .update({ status: "rejected" })
      .eq("uid", uid)
      .select("uid");
    if (error) { setFetchError(`Reject failed: ${error.message}`); return; }
    if (!data || data.length === 0) { setFetchError("Reject blocked by RLS — run admin_rls_policies.sql in Supabase SQL Editor."); return; }
    fetchQuestions();
  }

  useEffect(() => { fetchQuestions(); }, [fetchQuestions]);

  useEffect(() => {
    setPreviewAnswer("");
    setPreviewResetKey(k => k + 1);
  }, [
    form.type, form.answer, form.text,
    form.choice_1, form.choice_2, form.choice_3, form.choice_4,
    form.choice_5, form.choice_6,
    form.nl_min, form.nl_max, form.nl_step,
    form.tr_col_headers, form.tr_rows,
    form.variables,
    form.df_items, form.df_bins,
    form.pss_sentences, form.span_passage,
  ]);

  // When navigated here from the Reports panel, auto-open the edit modal for the flagged question
  useEffect(() => {
    if (!initialEditUid) return;
    (async () => {
      const { data } = await supabase
        .from("all_questions")
        .select("uid, type, text, choice_1, choice_2, choice_3, choice_4, answer, subject, sub_category, difficulty, media_refs, source, status, extra_data")
        .eq("uid", initialEditUid)
        .single();
      if (data) {
        openEdit(data as Question);
        setActiveReportId(initialReportId ?? null);
      }
      onEditHandled?.();
    })();
  // openEdit is stable (defined with plain function, not useCallback) — intentionally omitted from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditUid]);

  function setField<K extends keyof FormData>(key: K, val: FormData[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }

  function addMediaItem() {
    const nextLetter = String.fromCharCode(65 + mediaItems.length);
    const autoId = form.uid?.trim() ? `${form.uid.trim()}_${nextLetter}` : `_${nextLetter}`;
    setMediaItems(prev => [...prev, { mediaId: autoId, media_type: "graph", file: null, passageText: "", previewUrl: "", isExisting: false }]);
  }

  function removeMediaItem(idx: number) {
    setMediaItems(prev => {
      if (prev[idx].previewUrl && !prev[idx].isExisting) URL.revokeObjectURL(prev[idx].previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  }

  function updateMediaItem(idx: number, patch: Partial<MediaItem>) {
    setMediaItems(prev => prev.map((item, i) => i === idx ? { ...item, ...patch } : item));
  }

  function handleImageFile(idx: number, file: File | undefined) {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    updateMediaItem(idx, { file, previewUrl, isExisting: false });
  }

  function openAdd() {
    setForm({ ...EMPTY_FORM });
    setOriginalSubCategory(null);
    setIsNewTopic(false);
    setNewTopicName("");
    setMediaItems([]);
    setSaveError(null);
    setShowPreview(false);
    setModalMode("add");
  }

  async function openEdit(q: Question) {
    const ed = (q.extra_data ?? {}) as Record<string, unknown>;
    setForm({
      ...q,
      choice_5: (ed.choice_5 as string) ?? "",
      choice_6: (ed.choice_6 as string) ?? "",
      select_count: ed.select_count !== undefined ? String(ed.select_count) : "",
      variables: Array.isArray(ed.variables) ? (ed.variables as string[]).join(", ") : "",
      nl_min:  ed.min  !== undefined ? String(ed.min)  : "-10",
      nl_max:  ed.max  !== undefined ? String(ed.max)  : "10",
      nl_step: ed.step !== undefined ? String(ed.step) : "1",
      tr_col_headers: Array.isArray(ed.col_headers)
        ? (ed.col_headers as string[]).join(", ")
        : "",
      tr_rows: Array.isArray(ed.rows)
        ? (ed.rows as string[]).join("\n")
        : "",
      df_items: Array.isArray(ed.items)
        ? (ed.items as string[]).join("\n")
        : "",
      df_bins: Array.isArray(ed.bins)
        ? (ed.bins as string[]).join(", ")
        : "",
      pss_sentences: Array.isArray(ed.sentences)
        ? (ed.sentences as string[]).join("\n")
        : "",
      span_passage: typeof ed.passage === "string" ? ed.passage : "",
    });
    setOriginalForm({ ...q });
    setOriginalSubCategory(q.sub_category ?? null);
    setIsNewTopic(false);
    setNewTopicName("");
    setMediaItems([]);
    setSaveError(null);
    setShowPreview(true);
    setModalMode("edit");

    // Use the SECURITY DEFINER RPC to bypass RLS on dictionary_of_media SELECT
    const { data } = await supabase.rpc("get_media_for_question", { p_question_id: q.uid });

    if (data && (data as unknown[]).length > 0) {
      // Deduplicate by media_id in case the DB has stale duplicate rows
      const seenMediaIds = new Set<string>();
      const dedupedMedia = (data as { media_id: string; media_type: MediaType; content: string }[])
        .filter(m => { if (seenMediaIds.has(m.media_id)) return false; seenMediaIds.add(m.media_id); return true; });
      // Strip any stale ?t= cache-buster suffixes baked in by earlier saves.
      const cleanContentUrl = (url: string | null) =>
        url ? url.split("?")[0] : "";
      setMediaItems(dedupedMedia.map(m => ({
        mediaId: m.media_id,
        media_type: m.media_type ?? "graph",
        file: null,
        passageText: m.media_type === "passage" ? (m.content ?? "") : "",
        previewUrl: m.media_type !== "passage" ? cleanContentUrl(m.content) : "",
        isExisting: true,
        _origId: m.media_id,
        _origType: m.media_type ?? "graph",
        _origContent: m.content ?? "",
      })));
    } else if (q.media_refs?.trim()) {
      setMediaItems(q.media_refs.split(/[,\s]+/).filter(Boolean).map(id => ({
        mediaId: id.trim().replace(/^\[(.+)\]$/, "$1"),
        media_type: "graph" as MediaType,
        file: null, passageText: "", previewUrl: "", isExisting: true,
      })));
    }
  }

  async function closeModal() {
    const wasFromReport = activeReportId !== null;
    if (activeReportId) {
      await supabase.from("question_reports").update({ status: "reviewed" }).eq("id", activeReportId);
      setActiveReportId(null);
    }
    setModalMode(null);
    if (wasFromReport) onReturnToReports?.();
  }

  async function save() {
    if (!form.uid?.trim()) { setSaveError("UID is required."); return; }
    if (!form.text?.trim()) { setSaveError("Question text is required."); return; }
    if (!form.answer?.trim()) { setSaveError("Answer is required."); return; }
    if (!form.sub_category?.trim()) { setSaveError("Topic table (sub_category) is required."); return; }

    setSaving(true);
    setSaveError(null);

    // Duplicate media ID check — warn if two different items share the same ID (after bracket-stripping)
    const nonEmptyIds = mediaItems.map(m => m.mediaId.trim().replace(/^\[(.+)\]$/, "$1")).filter(Boolean);
    const seen = new Set<string>();
    for (const id of nonEmptyIds) {
      if (seen.has(id)) {
        setSaveError(`Duplicate media ID "${id}" — each media item must have a unique ID on this question.`);
        setSaving(false);
        return;
      }
      seen.add(id);
    }

    if (isNewTopic && form.sub_category?.trim()) {
      const { error: rpcErr } = await supabase.rpc("create_topic_table", { table_name: form.sub_category.trim() });
      if (rpcErr) {
        setSaveError(`Could not create topic table "${form.sub_category}": ${rpcErr.message}`);
        setSaving(false);
        return;
      }
    }

    const mediaRefsStr = mediaItems.map(m => m.mediaId.trim().replace(/^\[(.+)\]$/, "$1")).filter(Boolean).join(", ") || null;

    // Serialize virtual fields into extra_data JSONB
    const extraData: Record<string, unknown> | null = (() => {
      if (form.type === "multi-select") {
        const ed: Record<string, unknown> = {};
        const sc = Number(form.select_count);
        if (!isNaN(sc) && sc > 0) ed.select_count = sc;
        if ((form.choice_5 as string)?.trim()) ed.choice_5 = (form.choice_5 as string).trim();
        if ((form.choice_6 as string)?.trim()) ed.choice_6 = (form.choice_6 as string).trim();
        return Object.keys(ed).length > 0 ? ed : null;
      }
      if (form.type === "expression") {
        const vars = (form.variables ?? "").split(",").map(v => v.trim()).filter(Boolean);
        return vars.length > 0 ? { variables: vars } : null;
      }
      if (form.type === "number_line_click") {
        const mn = parseFloat((form.nl_min as string) ?? "");
        const mx = parseFloat((form.nl_max as string) ?? "");
        const st = parseFloat((form.nl_step as string) ?? "");
        const ed: Record<string, unknown> = {};
        if (isFinite(mn)) ed.min  = mn;
        if (isFinite(mx)) ed.max  = mx;
        if (isFinite(st) && st > 0) ed.step = st;
        return Object.keys(ed).length > 0 ? ed : null;
      }
      if (form.type === "table_row_radio") {
        const cols = (form.tr_col_headers ?? "")
          .split(",").map((s: string) => s.trim()).filter(Boolean);
        const rowsArr = (form.tr_rows ?? "")
          .split("\n").map((s: string) => s.trim()).filter(Boolean);
        if (cols.length === 0 || rowsArr.length === 0) return null;
        return { col_headers: cols, rows: rowsArr };
      }
      if (form.type === "drag_fill_multiple") {
        const ed: Record<string, unknown> = {};
        if ((form.choice_5 as string)?.trim()) ed.choice_5 = (form.choice_5 as string).trim();
        if ((form.choice_6 as string)?.trim()) ed.choice_6 = (form.choice_6 as string).trim();
        return Object.keys(ed).length > 0 ? ed : null;
      }
      if (form.type === "drag_to_bin" || form.type === "drag_to_categorize") {
        const items = (form.df_items ?? "").split("\n").map((s: string) => s.trim()).filter(Boolean);
        const bins  = (form.df_bins  ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
        if (items.length === 0 || bins.length === 0) return null;
        return { items, bins };
      }
      if (form.type === "in_passage_sentence_select") {
        const sentences = (form.pss_sentences ?? "").split("\n").map((s: string) => s.trim()).filter(Boolean);
        if (sentences.length === 0) return null;
        return { sentences };
      }
      if (form.type === "inline_text_span_click") {
        const passage = (form.span_passage ?? "").trim();
        if (!passage) return null;
        return { passage };
      }
      return null;
    })();

    // Fields for all_questions — uid only used for INSERT, not in UPDATE SET
    const fields = {
      type: form.type ?? "mcq",
      subject: form.subject || null,
      sub_category: form.sub_category,
      difficulty: form.difficulty || null,
      text: form.text,
      choice_1: (form.type === "linear_graphing" || form.type === "number_line_click" || form.type === "table_row_radio" || form.type === "drag_to_bin" || form.type === "drag_to_categorize" || form.type === "in_passage_sentence_select" || form.type === "inline_text_span_click") ? null : (form.choice_1 || null),
      choice_2: (form.type === "linear_graphing" || form.type === "number_line_click" || form.type === "table_row_radio" || form.type === "drag_to_bin" || form.type === "drag_to_categorize" || form.type === "in_passage_sentence_select" || form.type === "inline_text_span_click") ? null : (form.choice_2 || null),
      choice_3: (form.type === "linear_graphing" || form.type === "number_line_click" || form.type === "table_row_radio" || form.type === "drag_to_bin" || form.type === "drag_to_categorize" || form.type === "in_passage_sentence_select" || form.type === "inline_text_span_click") ? null : (form.choice_3 || null),
      choice_4: (form.type === "linear_graphing" || form.type === "number_line_click" || form.type === "table_row_radio" || form.type === "drag_to_bin" || form.type === "drag_to_categorize" || form.type === "in_passage_sentence_select" || form.type === "inline_text_span_click") ? null : (form.choice_4 || null),
      answer: form.answer,
      media_refs: mediaRefsStr,
      source: form.source || "bank",
      extra_data: extraData,
    };

    // Topic tables only have the original core columns — exclude anything added later
    const topicPayload = {
      uid: form.uid,
      type: fields.type,
      text: fields.text,
      choice_1: fields.choice_1,
      choice_2: fields.choice_2,
      choice_3: fields.choice_3,
      choice_4: fields.choice_4,
      answer: fields.answer,
      difficulty: fields.difficulty,
    };

    let allQErr: { message: string } | null = null;
    let changedFields: Record<string, unknown> = {};

    if (modalMode === "add") {
      const { error } = await supabase.from("all_questions").insert([{ uid: form.uid, ...fields }]);
      allQErr = error;
    } else {
      // Only send fields that actually changed
      const norm = (v: unknown, isRefs = false): unknown => {
        if (v === null || v === undefined || v === "") return null;
        if (isRefs) return String(v).split(/[,\s]+/).filter(Boolean).join(",");
        return v;
      };
      for (const [key, newVal] of Object.entries(fields)) {
        const origVal = (originalForm as Record<string, unknown> | null)?.[key];
        if (norm(newVal, key === "media_refs") !== norm(origVal, key === "media_refs")) {
          changedFields[key] = newVal;
        }
      }

      if (Object.keys(changedFields).length > 0) {
        const { data: updated, error } = await supabase
          .from("all_questions")
          .update(changedFields)
          .eq("uid", form.uid!)
          .select("uid");
        allQErr = error;
        if (!error && (!updated || updated.length === 0)) {
          setSaveError("Save blocked: 0 rows updated. Run admin_rls_policies.sql in the Supabase SQL Editor to grant admin write access.");
          setSaving(false);
          return;
        }
      }
    }

    if (allQErr) { setSaveError(`all_questions error: ${allQErr.message}`); setSaving(false); return; }

    if (modalMode === "add") {
      const { error: topicErr } = await supabase.from(form.sub_category!).insert([topicPayload]);
      if (topicErr) {
        setSaveError(`Topic table "${form.sub_category}" error: ${topicErr.message}. all_questions was updated.`);
        setSaving(false);
        return;
      }
    } else {
      // Edit mode: topic tables are best-effort — all_questions is already saved above.
      // AI-generated questions were never inserted into topic tables, so errors here are expected.
      const subCategoryChanged = originalSubCategory && originalSubCategory !== form.sub_category;
      if (subCategoryChanged) {
        await supabase.from(originalSubCategory!).delete().eq("uid", form.uid!);
        await supabase.from(form.sub_category!).insert([topicPayload]);
      } else {
        const topicKeys = ["type", "text", "choice_1", "choice_2", "choice_3", "choice_4", "answer", "difficulty"];
        if (Object.keys(changedFields).some(k => topicKeys.includes(k))) {
          await supabase.from(form.sub_category!).update(topicPayload).eq("uid", form.uid!);
        }
      }
    }

    if (modalMode === "add" && !categories.includes(form.sub_category!)) {
      setCategories(prev => [...prev, form.sub_category!].sort());
    }

    let mediaChanged = false;
    for (let i = 0; i < mediaItems.length; i++) {
      const item = mediaItems[i];
      // Strip any accidental [brackets] — e.g. copied from choice text like [25A_Q86_NLA]
      const cleanId = item.mediaId.trim().replace(/^\[(.+)\]$/, "$1");

      // Determine what changed
      const hasNewFile = isImageType(item.media_type) && item.file !== null;
      const passageChanged = item.media_type === "passage" &&
        item.passageText.trim() !== (item._origContent ?? "").trim();
      const idChanged = item.isExisting && !!item._origId && item._origId !== cleanId;
      const typeChanged = item.isExisting && !!item._origType && item._origType !== item.media_type;

      const needsSave = hasNewFile || passageChanged || !item.isExisting || idChanged || typeChanged;
      if (!needsSave) continue;
      mediaChanged = true;

      let content: string | null = null;

      if (hasNewFile) {
        const ext = item.file!.name.split(".").pop() ?? "jpg";
        const filePath = `${cleanId}.${ext}`;
        let { error: uploadErr } = await supabase.storage
          .from("Images")
          .upload(filePath, item.file!, { upsert: true });
        if (uploadErr) {
          const isBucketMissing =
            uploadErr.message.toLowerCase().includes("bucket") ||
            uploadErr.message.toLowerCase().includes("not found");
          if (isBucketMissing) {
            // Bucket doesn't exist — try to create it, then retry upload
            await supabase.storage.createBucket("Images", { public: true });
            const retry = await supabase.storage
              .from("Images")
              .upload(filePath, item.file!, { upsert: true });
            uploadErr = retry.error;
          }
        }
        if (uploadErr) {
          const isBucketMissing =
            uploadErr.message.toLowerCase().includes("bucket") ||
            uploadErr.message.toLowerCase().includes("not found");
          setSaveError(
            isBucketMissing
              ? `Storage bucket "Images" not found. In the Supabase Dashboard go to Storage → New bucket → name it "Images" → enable Public → Create. Question was saved.`
              : `Image upload failed for "${cleanId}": ${uploadErr.message}. Question was saved.`
          );
          setSaving(false);
          return;
        }
        const { data: urlData } = supabase.storage.from("Images").getPublicUrl(filePath);
        content = urlData.publicUrl;
      } else if (item.media_type === "passage") {
        content = item.passageText.trim() || null;
      } else {
        // Image type, no new file (type or ID changed) — keep the existing URL
        content = item.previewUrl || null;
      }

      // If the media ID was renamed, delete the old record via RPC (bypasses RLS)
      if (idChanged && item._origId) {
        await supabase.rpc("delete_media_record", { p_media_id: item._origId });
      }

      if (content !== null) {
        // SECURITY DEFINER RPC bypasses RLS — works for both insert and update
        const { error: dictErr } = await supabase.rpc("upsert_media_record", {
          p_media_id:    cleanId,
          p_question_id: form.uid,
          p_media_type:  item.media_type,
          p_content:     content,
          p_index:       0,  // unused by INSERT path; index PK is auto-assigned by DB
        });

        if (dictErr) {
          setSaveError(`Media record failed for "${cleanId}": ${dictErr.message}. Run media_rpc_functions.sql in the Supabase SQL Editor.`);
          setSaving(false);
          return;
        }
      }
    }

    if (modalMode === "edit") {
      // Immediately reflect the changes in the list without waiting for the network refetch
      setQuestions(prev => prev.map(q =>
        q.uid === form.uid! ? { ...q, ...fields } : q
      ));
    }

    const wasFromReport = modalMode === "edit" && activeReportId !== null;
    if (modalMode === "edit" && activeReportId) {
      const reportStatus = (Object.keys(changedFields).length > 0 || mediaChanged) ? "resolved" : "reviewed";
      await supabase.from("question_reports").update({ status: reportStatus }).eq("id", activeReportId);
      setActiveReportId(null);
    }

    setModalMode(null);
    if (wasFromReport) onReturnToReports?.();
    // silent = true: skip the loading flash so scroll position is preserved after edit
    fetchQuestions(modalMode === "edit");
    setSaving(false);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    await supabase.from("all_questions").delete().eq("uid", deleteTarget.uid);
    if (deleteTarget.sub_category) {
      await supabase.from(deleteTarget.sub_category).delete().eq("uid", deleteTarget.uid);
    }
    setDeleteTarget(null);
    fetchQuestions();
    setDeleting(false);
  }

  // ── Preview derived data (mirrors mocktest.tsx choice-image logic) ─────────────
  const previewChoiceImages: Record<string, string> = {};
  const previewChoiceMediaIds = new Set<string>();

  // Pattern 1: NLA/NLB/NLC/NLD suffix → mapped to choice letter A/B/C/D
  for (const item of mediaItems) {
    const cleanId = item.mediaId.trim().replace(/^\[(.+)\]$/, "$1");
    const suffix = cleanId.split("_").pop() ?? "";
    if (/^NL[ABCD]$/i.test(suffix) && item.previewUrl) {
      const letter = suffix.slice(2).toUpperCase();
      previewChoiceImages[letter] = item.previewUrl;
      previewChoiceMediaIds.add(cleanId);
    }
  }

  // Pattern 2: choice value IS a media_id (with or without [brackets])
  const previewMediaByCleanId = new Map(
    mediaItems
      .filter(item => item.previewUrl)
      .map(item => [item.mediaId.trim().replace(/^\[(.+)\]$/, "$1"), item.previewUrl])
  );
  (["choice_1", "choice_2", "choice_3", "choice_4"] as const).forEach((key, i) => {
    const raw = (form[key] as string ?? "").trim();
    const val = raw.replace(/^\[(.+)\]$/, "$1");
    if (val && previewMediaByCleanId.has(val)) {
      previewChoiceImages["ABCD"[i]] = previewMediaByCleanId.get(val)!;
      previewChoiceMediaIds.add(val);
    }
  });

  // Display media = media items not consumed as choice images
  const previewDisplayMedia = mediaItems.filter(item => {
    const cleanId = item.mediaId.trim().replace(/^\[(.+)\]$/, "$1");
    return !previewChoiceMediaIds.has(cleanId);
  });

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const previewResult: boolean | null = checkPreviewAnswer(form.type as QuestionType, previewAnswer, form.answer ?? "");

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* ── Toolbar ── */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-zinc-200 flex items-center gap-2 sm:gap-3 flex-wrap shrink-0">
        <div className="shrink-0 mr-2">
          <h2 className="text-base font-bold text-zinc-900">Question Bank</h2>
          <p className="text-sm text-zinc-400">{total} questions</p>
        </div>

        <input
          type="search"
          placeholder="Search by UID or question text…"
          value={searchInput}
          onChange={e => handleSearchChange(e.target.value)}
          className="flex-1 min-w-0 bg-zinc-50 border border-zinc-200 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-sm sm:text-base text-zinc-700 placeholder-zinc-400 focus:outline-none focus:border-amber-500/40 transition-colors"
        />

        <select title="Filter by subject" value={filterSubject} onChange={e => { setFilterSubject(e.target.value); setPage(0); }}
          className={`bg-zinc-50 border rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-sm sm:text-base focus:outline-none transition-colors ${filterSubject ? "border-amber-400 text-amber-700 bg-amber-50 focus:border-amber-500" : "border-zinc-200 text-zinc-600 focus:border-amber-500/40"}`}>
          <option value="">All Subjects</option>
          <option value="english">English</option>
          <option value="math">Math</option>
        </select>

        <select title="Filter by type" value={filterType} onChange={e => {
            const t = e.target.value;
            setFilterType(t);
            setPage(0);
            // inline-dropdown is always English; auto-correct a conflicting Math subject filter
            if (t === "inline-dropdown" && filterSubject === "math") setFilterSubject("");
            // non-ELA types are always Math; auto-correct a conflicting English subject filter
            const mathOnlyTypes = ["grid-in", "linear_graphing", "multi-select", "expression", "number_line_click", "table_row_radio"];
            if (mathOnlyTypes.includes(t) && filterSubject === "english") setFilterSubject("");
            // drag_fill types can be both — no auto-correct needed
          }}
          className={`bg-zinc-50 border rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-sm sm:text-base focus:outline-none transition-colors ${filterType ? "border-amber-400 text-amber-700 bg-amber-50 focus:border-amber-500" : "border-zinc-200 text-zinc-600 focus:border-amber-500/40"}`}>
          <option value="">All Types</option>
          <option value="mcq">MCQ</option>
          <option value="grid-in">Grid-in</option>
          <option value="linear_graphing">Graphing</option>
          <option value="multi-select">Multi-select</option>
          <option value="expression">Expression</option>
          <option value="inline-dropdown">Inline Dropdown</option>
          <option value="number_line_click">Number Line</option>
          <option value="table_row_radio">Table Row Radio</option>
          <option value="drag_fill_single">Drag Fill (Single)</option>
          <option value="drag_fill_multiple">Drag Fill (Multiple)</option>
          <option value="drag_to_bin">Drag to Bin</option>
          <option value="drag_to_categorize">Drag to Categorize</option>
          <option value="in_passage_sentence_select">Sentence Select</option>
          <option value="inline_text_span_click">Span Click</option>
        </select>

        <select title="Filter by source" value={filterSource} onChange={e => { setFilterSource(e.target.value); setPage(0); }}
          className={`bg-zinc-50 border rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-sm sm:text-base focus:outline-none transition-colors ${filterSource ? "border-amber-400 text-amber-700 bg-amber-50 focus:border-amber-500" : "border-zinc-200 text-zinc-600 focus:border-amber-500/40"}`}>
          <option value="">All Sources</option>
          <option value="bank">Question Bank</option>
          <option value="ai">AI Generated</option>
        </select>

        <div className="relative">
          <select title="Filter by status" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(0); }}
            className={`bg-zinc-50 border rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-sm sm:text-base focus:outline-none transition-colors ${filterStatus ? "border-amber-400 text-amber-700 bg-amber-50 focus:border-amber-500" : "border-zinc-200 text-zinc-600 focus:border-amber-500/40"}`}>
            <option value="">All Statuses</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending Review</option>
            <option value="rejected">Rejected</option>
          </select>
          {pendingCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[1.1rem] h-[1.1rem] flex items-center justify-center text-xs font-bold bg-amber-500 text-white rounded-full px-1">
              {pendingCount}
            </span>
          )}
        </div>

        <select title="Filter by topic" value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(0); }}
          className={`bg-zinc-50 border rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-sm sm:text-base focus:outline-none transition-colors ${filterCategory ? "border-amber-400 text-amber-700 bg-amber-50 focus:border-amber-500" : "border-zinc-200 text-zinc-600 focus:border-amber-500/40"}`}>
          <option value="">All Topics</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {(filterSubject || filterType || filterSource || filterStatus || filterCategory || search) && (
          <button type="button" onClick={() => {
            setFilterSubject(""); setFilterType(""); setFilterSource("");
            setFilterStatus(""); setFilterCategory(""); setSearch(""); setSearchInput(""); setPage(0);
          }}
            className="shrink-0 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-300 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap">
            Clear filters
          </button>
        )}

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button type="button" onClick={() => setShowGenerate(true)}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg transition-colors">
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="hidden sm:inline">Generate AI</span>
            <span className="sm:hidden">AI</span>
          </button>
          <button type="button" onClick={openAdd}
            className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg transition-colors whitespace-nowrap">
            + <span className="hidden sm:inline">Add </span>Question
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="mx-5 mt-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-base text-red-400 shrink-0">{fetchError}</div>
      )}

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-base border-collapse">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="border-b border-zinc-200">
              <th className="px-4 py-3 text-left text-sm font-bold text-zinc-400 uppercase tracking-widest">UID</th>
              <th className="px-4 py-3 text-left text-sm font-bold text-zinc-400 uppercase tracking-widest">Subject</th>
              <th className="px-4 py-3 text-left text-sm font-bold text-zinc-400 uppercase tracking-widest">Type</th>
              <th className="px-4 py-3 text-left text-sm font-bold text-zinc-400 uppercase tracking-widest">Topic</th>
              <th className="px-4 py-3 text-left text-sm font-bold text-zinc-400 uppercase tracking-widest">Difficulty</th>
              <th className="px-4 py-3 text-left text-sm font-bold text-zinc-400 uppercase tracking-widest">Status</th>
              <th className="px-4 py-3 text-left text-sm font-bold text-zinc-400 uppercase tracking-widest w-full">Question</th>
              <th className="px-4 py-3 text-right text-sm font-bold text-zinc-400 uppercase tracking-widest whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="py-16 text-center text-zinc-400 text-base">Loading…</td></tr>
            ) : questions.length === 0 ? (
              <tr><td colSpan={8} className="py-16 text-center text-zinc-400 text-base">No questions match the current filters.</td></tr>
            ) : questions.map(q => (
              <tr key={q.uid} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors group">
                <td className="px-4 py-3 font-mono text-sm text-zinc-500 whitespace-nowrap align-top">{q.uid}</td>
                <td className="px-4 py-3 align-top">
                  {q.subject
                    ? <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${q.subject === "english" ? "bg-blue-500/10 text-blue-500" : "bg-violet-500/10 text-violet-500"}`}>
                        {q.subject === "english" ? "English" : "Math"}
                      </span>
                    : <span className="text-zinc-400 text-sm">—</span>}
                </td>
                <td className="px-4 py-3 align-top">
                  <TypeBadge type={q.type} source={q.source} />
                </td>
                <td className="px-4 py-3 font-mono text-sm text-zinc-500 whitespace-nowrap align-top">{q.sub_category ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-zinc-500 capitalize align-top">{q.difficulty ?? "—"}</td>
                <td className="px-4 py-3 align-top whitespace-nowrap">
                  {q.status === "pending" ? (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">Pending</span>
                  ) : q.status === "rejected" ? (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-500">Rejected</span>
                  ) : (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">Approved</span>
                  )}
                </td>
                <td className="px-4 py-3 align-top max-w-lg">
                  <p className="text-sm text-zinc-500 leading-relaxed line-clamp-2">{q.text}</p>
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="flex gap-1.5 justify-end flex-wrap">
                    {q.status === "pending" && (
                      <>
                        <button type="button" onClick={() => approveQuestion(q.uid)}
                          className="text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-md border border-emerald-200 transition-colors whitespace-nowrap">
                          ✓ Approve
                        </button>
                        <button type="button" onClick={() => rejectQuestion(q.uid)}
                          className="text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-md border border-red-200 transition-colors whitespace-nowrap">
                          ✕ Reject
                        </button>
                      </>
                    )}
                    {q.status === "rejected" && (
                      <button type="button" onClick={() => approveQuestion(q.uid)}
                        className="text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-md border border-emerald-200 transition-colors whitespace-nowrap">
                        ✓ Approve
                      </button>
                    )}
                    <button type="button" onClick={() => openEdit(q)}
                      className="text-sm font-medium text-zinc-500 hover:text-amber-500 px-3 py-1.5 rounded-md hover:bg-amber-500/8 border border-zinc-200 hover:border-amber-500/25 transition-colors whitespace-nowrap">
                      Edit
                    </button>
                    {deleteTarget?.uid === q.uid ? (
                      <div className="flex gap-1">
                        <button type="button" onClick={confirmDelete} disabled={deleting}
                          className="text-sm font-medium text-white bg-red-600 hover:bg-red-500 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50">
                          {deleting ? "…" : "Confirm"}
                        </button>
                        <button type="button" onClick={() => setDeleteTarget(null)}
                          className="text-sm text-zinc-400 hover:text-zinc-700 px-2 py-1.5 rounded-md hover:bg-zinc-100 transition-colors">
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setDeleteTarget(q)}
                        className="text-sm font-medium text-zinc-500 hover:text-red-400 px-3 py-1.5 rounded-md hover:bg-red-500/8 border border-zinc-200 hover:border-red-500/25 transition-colors">
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      <div className="px-6 py-3 border-t border-zinc-200 flex items-center justify-between shrink-0">
        <span className="text-sm text-zinc-400">
          {total === 0 ? "No results" : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total}`}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="px-3 py-1.5 text-sm rounded-md bg-zinc-50 border border-zinc-200 text-zinc-500 hover:text-zinc-800 hover:border-zinc-300 disabled:opacity-30 transition-colors">
            ← Prev
          </button>
          <span className="text-sm text-zinc-400 tabular-nums">{page + 1} / {Math.max(1, totalPages)}</span>
          <button type="button" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE_SIZE >= total}
            className="px-3 py-1.5 text-sm rounded-md bg-zinc-50 border border-zinc-200 text-zinc-500 hover:text-zinc-800 hover:border-zinc-300 disabled:opacity-30 transition-colors">
            Next →
          </button>
        </div>
      </div>

      {/* ── Generate AI Questions Modal ── */}
      {showGenerate && (
        <GenerateModal
          onClose={() => setShowGenerate(false)}
          onSuccess={fetchQuestions}
        />
      )}

      {/* ── Add / Edit Modal ── */}
      {modalMode && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-zinc-200 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">
            <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-zinc-900">
                  {modalMode === "add" ? "Add New Question" : "Edit Question"}
                </h3>
                {modalMode === "edit" && (
                  <p className="text-sm text-zinc-400 font-mono mt-0.5">{form.uid}</p>
                )}
              </div>
              <button type="button" onClick={closeModal}
                className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors text-base">
                ✕
              </button>
            </div>

            <div className="flex flex-1 overflow-hidden min-h-0">
            {/* ── Left: form ── */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 border-r border-zinc-200 min-w-0">
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>UID</Label>
                  <Input value={form.uid ?? ""} onChange={v => setField("uid", v)} placeholder="e.g. 25A_Q1" disabled={modalMode === "edit"} mono autoFocus={modalMode === "add"} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Subject</Label>
                  <Select value={form.subject ?? ""} onChange={v => setField("subject", v)} title="Subject">
                    <option value="">—</option>
                    <option value="english">English</option>
                    <option value="math">Math</option>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Type</Label>
                  <Select
                    value={form.type ?? "mcq"}
                    onChange={v => {
                      const t = v as QuestionType;
                      setField("type", t);
                      if (t === "linear_graphing") {
                        setField("subject", "math");
                        setField("sub_category", "Linear_Graphing");
                      }
                      if (t === "number_line_click") {
                        setField("subject", "math");
                      }
                    }}
                    title="Question type"
                  >
                    <option value="mcq">MCQ</option>
                    <option value="grid-in">Grid-in</option>
                    <option value="linear_graphing">Linear Graphing</option>
                    <option value="multi-select">Multi-select</option>
                    <option value="expression">Expression Editor</option>
                    <option value="inline-dropdown">Inline Dropdown</option>
                    <option value="number_line_click">Number Line Click</option>
                    <option value="table_row_radio">Table Row Radio</option>
                    <option value="drag_fill_single">Drag Fill (Single)</option>
                    <option value="drag_fill_multiple">Drag Fill (Multiple)</option>
                    <option value="drag_to_bin">Drag to Bin</option>
                    <option value="drag_to_categorize">Drag to Categorize</option>
                    <option value="in_passage_sentence_select">Sentence Select</option>
                    <option value="inline_text_span_click">Span Click</option>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Topic Table</Label>
                    {!isNewTopic ? (
                      <button type="button" onClick={() => { setIsNewTopic(true); setField("sub_category", ""); setNewTopicName(""); }}
                        className="text-sm text-amber-500 hover:text-amber-400 font-medium transition-colors">
                        + New topic
                      </button>
                    ) : (
                      <button type="button" onClick={() => { setIsNewTopic(false); setNewTopicName(""); setField("sub_category", ""); }}
                        className="text-sm text-zinc-400 hover:text-zinc-600 font-medium transition-colors">
                        ← Pick existing
                      </button>
                    )}
                  </div>
                  {isNewTopic ? (
                    <div className="flex flex-col gap-1">
                      <Input value={newTopicName} onChange={v => { setNewTopicName(v); setField("sub_category", v.trim().toLowerCase().replace(/\s+/g, "_")); }} placeholder="e.g. idioms (creates new table)" mono autoFocus />
                      <p className="text-sm text-zinc-400">Creates a new Postgres table with this name.</p>
                    </div>
                  ) : (
                    <Select value={form.sub_category ?? ""} onChange={v => setField("sub_category", v)} title="Topic table">
                      <option value="">— select topic —</option>
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </Select>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Difficulty</Label>
                  <Select value={form.difficulty ?? ""} onChange={v => setField("difficulty", v)} title="Difficulty">
                    <option value="">—</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Question Text</Label>
                <Textarea value={form.text ?? ""} onChange={v => setField("text", v)}
                  placeholder={
                    form.type === "inline-dropdown"
                      ? "Type the sentence and put [BLANK] where the dropdown appears. e.g. \"The scientist carefully [BLANK] the results.\""
                      : form.type === "drag_fill_single"
                        ? "Type the sentence and put [BLANK] where the word tile drops. e.g. \"The scientist was [BLANK] in her approach.\""
                        : form.type === "drag_fill_multiple"
                          ? "Type the sentence(s) and number each blank: [BLANK_1], [BLANK_2], [BLANK_3]… e.g. \"The [BLANK_1] scientist [BLANK_2] her findings.\""
                          : form.type === "drag_to_bin" || form.type === "drag_to_categorize"
                            ? "Type the question or instruction, e.g. \"Classify each number as Prime, Composite, or Neither.\""
                            : "Type the full question text here…"
                  }
                  rows={form.type === "inline-dropdown" || form.type === "drag_fill_single" ? 3 : 6}
                />
                {form.type === "inline-dropdown" && (
                  <p className="text-xs text-zinc-400">Use <code className="bg-zinc-100 px-1 rounded font-mono">[BLANK]</code> to mark where the dropdown appears.</p>
                )}
                {form.type === "drag_fill_single" && (
                  <p className="text-xs text-zinc-400">Use <code className="bg-zinc-100 px-1 rounded font-mono">[BLANK]</code> to mark the single drop target.</p>
                )}
                {form.type === "drag_fill_multiple" && (
                  <p className="text-xs text-zinc-400">Use <code className="bg-zinc-100 px-1 rounded font-mono">[BLANK_1]</code>, <code className="bg-zinc-100 px-1 rounded font-mono">[BLANK_2]</code>, … for each blank in order. Answer: <code className="bg-zinc-100 px-1 rounded font-mono">A,C,B</code> means blank 1→A, blank 2→C, blank 3→B.</p>
                )}
              </div>

              {/* Answer choices — MCQ, multi-select, inline-dropdown, and drag fill types */}
              {(form.type === "mcq" || form.type === "multi-select" || form.type === "inline-dropdown" ||
                form.type === "drag_fill_single" || form.type === "drag_fill_multiple") && (
                <div className="flex flex-col gap-2.5">
                  <Label>
                    {form.type === "drag_fill_single" || form.type === "drag_fill_multiple"
                      ? "Word Tiles (draggable tokens)"
                      : "Answer Choices"}
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    {(["choice_1", "choice_2", "choice_3", "choice_4"] as const).map((key, i) => (
                      <div key={key} className="flex gap-2 items-center">
                        <span className="text-sm font-bold text-zinc-400 w-5 shrink-0">{String.fromCharCode(65 + i)}</span>
                        <Input value={(form[key] as string) ?? ""} onChange={v => setField(key, v)}
                          placeholder={
                            form.type === "drag_fill_single" || form.type === "drag_fill_multiple"
                              ? `Token ${String.fromCharCode(65 + i)}`
                              : `Choice ${String.fromCharCode(65 + i)}`
                          }
                        />
                      </div>
                    ))}
                    {(form.type === "multi-select" || form.type === "drag_fill_multiple") && (
                      <>
                        <div className="flex gap-2 items-center">
                          <span className="text-sm font-bold text-zinc-400 w-5 shrink-0">E</span>
                          <Input value={(form.choice_5 as string) ?? ""}
                            onChange={v => setField("choice_5", v)}
                            placeholder={form.type === "drag_fill_multiple" ? "Token E (optional extra)" : "Choice E (optional)"}
                          />
                        </div>
                        <div className="flex gap-2 items-center">
                          <span className="text-sm font-bold text-zinc-400 w-5 shrink-0">F</span>
                          <Input value={(form.choice_6 as string) ?? ""}
                            onChange={v => setField("choice_6", v)}
                            placeholder={form.type === "drag_fill_multiple" ? "Token F (optional extra)" : "Choice F (optional)"}
                          />
                        </div>
                      </>
                    )}
                  </div>
                  {form.type === "multi-select" && (
                    <div className="flex gap-2 items-center mt-1">
                      <span className="text-sm font-bold text-zinc-400 shrink-0">Select count</span>
                      <input
                        type="number"
                        min={1}
                        max={6}
                        value={(form.select_count as string) ?? ""}
                        onChange={e => setField("select_count", e.target.value)}
                        placeholder="How many to select (e.g. 2)"
                        className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-base text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/25 transition-colors font-mono"
                      />
                    </div>
                  )}
                  {form.type === "expression" && (
                    <div className="flex gap-2 items-center mt-1">
                      <span className="text-sm font-bold text-zinc-400 shrink-0">Variables</span>
                      <input
                        type="text"
                        value={(form.variables as string) ?? ""}
                        onChange={e => setField("variables", e.target.value)}
                        placeholder="Comma-separated, e.g. x, n, b  (avoid o and l)"
                        className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-base text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/25 transition-colors font-mono"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Table row radio config */}
              {form.type === "table_row_radio" && (
                <div className="flex flex-col gap-3">
                  <Label>Table Config</Label>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Column Headers</span>
                    <input
                      type="text"
                      value={(form.tr_col_headers as string) ?? ""}
                      onChange={e => setField("tr_col_headers", e.target.value)}
                      placeholder="e.g.  True, False   or   Positive, Negative, Zero"
                      className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-base text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/25 transition-colors font-mono"
                    />
                    <p className="text-xs text-zinc-400">Comma-separated. Each becomes a radio column. Max 6 columns.</p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Row Labels</span>
                    <textarea
                      rows={4}
                      value={(form.tr_rows as string) ?? ""}
                      onChange={e => setField("tr_rows", e.target.value)}
                      placeholder={"Statement 1\nStatement 2\nStatement 3"}
                      className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-base text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/25 transition-colors resize-y font-mono"
                    />
                    <p className="text-xs text-zinc-400">One row per line. Each line becomes a table row the student classifies.</p>
                  </div>
                </div>
              )}

              {/* Drag to bin / categorize config */}
              {(form.type === "drag_to_bin" || form.type === "drag_to_categorize") && (
                <div className="flex flex-col gap-3">
                  <Label>{form.type === "drag_to_bin" ? "Bin Config" : "Category Config"}</Label>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Item Chips</span>
                    <textarea
                      rows={4}
                      value={(form.df_items as string) ?? ""}
                      onChange={e => setField("df_items", e.target.value)}
                      placeholder={"prime\ncomposite\nnot prime and not composite\n...one item per line"}
                      className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-base text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/25 transition-colors resize-y font-mono"
                    />
                    <p className="text-xs text-zinc-400">One item per line. These are the chips students drag into bins/categories.</p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-wide">
                      {form.type === "drag_to_bin" ? "Bin Labels" : "Category Labels"}
                    </span>
                    <input
                      type="text"
                      value={(form.df_bins as string) ?? ""}
                      onChange={e => setField("df_bins", e.target.value)}
                      placeholder={form.type === "drag_to_bin" ? "e.g.  Prime, Composite, Neither" : "e.g.  Noun, Verb, Adjective"}
                      className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-base text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/25 transition-colors font-mono"
                    />
                    <p className="text-xs text-zinc-400">
                      Comma-separated. Each label becomes {form.type === "drag_to_bin" ? "a bin container" : "a column"}. Max 6.
                      {form.type === "drag_to_categorize" && " Use \"-\" in the answer for distractor items that belong in no category."}
                    </p>
                  </div>
                </div>
              )}

              {/* In-passage sentence select config */}
              {form.type === "in_passage_sentence_select" && (
                <div className="flex flex-col gap-3">
                  <Label>Passage Sentences</Label>
                  <textarea
                    rows={6}
                    value={(form.pss_sentences as string) ?? ""}
                    onChange={e => setField("pss_sentences", e.target.value)}
                    placeholder={"The dog ran across the park.\nIt leaped over the fence.\nThe children cheered loudly.\n...one sentence per line"}
                    className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-base text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/25 transition-colors resize-y font-mono"
                  />
                  <p className="text-xs text-zinc-400">One sentence per line. Students click a sentence to select it. Answer = 1-based sentence number (e.g., 3).</p>
                </div>
              )}

              {/* Inline text span click config */}
              {form.type === "inline_text_span_click" && (
                <div className="flex flex-col gap-3">
                  <Label>Passage with Spans</Label>
                  <textarea
                    rows={6}
                    value={(form.span_passage as string) ?? ""}
                    onChange={e => setField("span_passage", e.target.value)}
                    placeholder={"The [SPAN_A]quick brown[/SPAN_A] fox [SPAN_B]jumps over[/SPAN_B] the [SPAN_C]lazy dog[/SPAN_C]."}
                    className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-base text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/25 transition-colors resize-y font-mono text-sm"
                  />
                  <p className="text-xs text-zinc-400">
                    Wrap each clickable span with <code className="bg-zinc-100 px-1 rounded font-mono">[SPAN_A]...[/SPAN_A]</code>, <code className="bg-zinc-100 px-1 rounded font-mono">[SPAN_B]...[/SPAN_B]</code>, etc. Students click the labeled span. Answer = the letter of the correct span.
                  </p>
                </div>
              )}

              {/* Number line axis config */}
              {form.type === "number_line_click" && (
                <div className="flex flex-col gap-2">
                  <Label>Number Line Config</Label>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Min</span>
                      <input
                        type="number"
                        value={(form.nl_min as string) ?? "-10"}
                        onChange={e => setField("nl_min", e.target.value)}
                        placeholder="-10"
                        className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-base text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/25 transition-colors font-mono"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Max</span>
                      <input
                        type="number"
                        value={(form.nl_max as string) ?? "10"}
                        onChange={e => setField("nl_max", e.target.value)}
                        placeholder="10"
                        className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-base text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/25 transition-colors font-mono"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Step</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={(form.nl_step as string) ?? "1"}
                        onChange={e => setField("nl_step", e.target.value)}
                        placeholder="1"
                        className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-base text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/25 transition-colors font-mono"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400">Step is the snap increment (1 = integers, 0.5 = halves, 0.25 = quarters).</p>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label>Correct Answer</Label>
                {(form.type === "mcq" || form.type === "inline-dropdown" || form.type === "drag_fill_single") ? (
                  <div className="grid grid-cols-4 gap-2">
                    {(["A", "B", "C", "D"] as const).map((letter, i) => {
                      const choiceKey = `choice_${i + 1}` as keyof FormData;
                      const choiceText = (form[choiceKey] as string) ?? "";
                      const selected = form.answer === letter;
                      return (
                        <button key={letter} type="button" onClick={() => setField("answer", letter)} title={choiceText || `Choice ${letter}`}
                          className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border text-base font-bold transition-all ${
                            selected ? "bg-amber-500 border-amber-400 text-zinc-950" : "bg-zinc-50 border-zinc-200 text-zinc-400 hover:border-amber-500/40 hover:text-zinc-700"
                          }`}
                        >
                          <span>{letter}</span>
                          {choiceText && (
                            <span className={`text-sm font-normal leading-tight text-center line-clamp-2 ${selected ? "text-zinc-800" : "text-zinc-400"}`}>
                              {choiceText}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : form.type === "multi-select" ? (
                  <div className="flex flex-col gap-1.5">
                    <Input value={form.answer ?? ""} onChange={v => setField("answer", v)} placeholder="Comma-separated correct letters, e.g. A,C or A,B,E" mono />
                    <p className="text-xs text-zinc-400">Enter all correct answer letters separated by commas.</p>
                  </div>
                ) : form.type === "linear_graphing" ? (
                  <div className="flex flex-col gap-1.5">
                    <Input
                      value={form.answer ?? ""}
                      onChange={v => setField("answer", v)}
                      placeholder='{"m": 2, "b": -3}  or  {"vertical": true, "x": 4}'
                      mono
                    />
                    <p className="text-xs text-zinc-400">
                      Enter JSON: <span className="font-mono text-zinc-600">{"{"}"m": slope, "b": y-intercept{"}"}</span> or <span className="font-mono text-zinc-600">{"{"}"vertical": true, "x": x-value{"}"}</span>
                    </p>
                  </div>
                ) : form.type === "number_line_click" ? (
                  <div className="flex flex-col gap-1.5">
                    <Input
                      value={form.answer ?? ""}
                      onChange={v => setField("answer", v)}
                      placeholder="e.g. 3  or  -2.5  or  0.5"
                      mono
                    />
                    <p className="text-xs text-zinc-400">
                      Enter the exact numeric value the student must click (must be a multiple of Step within [Min, Max]).
                    </p>
                  </div>
                ) : form.type === "table_row_radio" ? (
                  <div className="flex flex-col gap-1.5">
                    <Input value={form.answer ?? ""} onChange={v => setField("answer", v)} placeholder="e.g.  A,B,A  or  A,B,C,A" mono />
                    <p className="text-xs text-zinc-400">
                      One letter per row, comma-separated. A = first column, B = second, etc.
                      {(() => {
                        const rowCount = (form.tr_rows as string ?? "")
                          .split("\n").map((s: string) => s.trim()).filter(Boolean).length;
                        return rowCount > 0 ? ` (${rowCount} row${rowCount !== 1 ? "s" : ""} defined)` : "";
                      })()}
                    </p>
                  </div>
                ) : form.type === "drag_fill_multiple" ? (
                  <div className="flex flex-col gap-1.5">
                    <Input value={form.answer ?? ""} onChange={v => setField("answer", v)} placeholder="e.g.  A,C,B  (blank 1→A, blank 2→C, blank 3→B)" mono />
                    <p className="text-xs text-zinc-400">
                      One letter per blank in order, comma-separated.
                      {(() => {
                        const blanks = (form.text ?? "").match(/\[BLANK_\d+\]/g) ?? [];
                        return blanks.length > 0 ? ` (${blanks.length} blank${blanks.length !== 1 ? "s" : ""} in text)` : " — add [BLANK_1], [BLANK_2], … to the text above.";
                      })()}
                    </p>
                  </div>
                ) : form.type === "drag_to_bin" ? (
                  <div className="flex flex-col gap-1.5">
                    <Input value={form.answer ?? ""} onChange={v => setField("answer", v)} placeholder="e.g.  A,B,A,C  (one bin letter per item in Items order)" mono />
                    <p className="text-xs text-zinc-400">
                      One bin letter per item, comma-separated. A = first bin, B = second, etc.
                      {(() => {
                        const itemCount = (form.df_items as string ?? "").split("\n").filter(s => s.trim()).length;
                        return itemCount > 0 ? ` (${itemCount} item${itemCount !== 1 ? "s" : ""} defined)` : "";
                      })()}
                    </p>
                  </div>
                ) : form.type === "drag_to_categorize" ? (
                  <div className="flex flex-col gap-1.5">
                    <Input value={form.answer ?? ""} onChange={v => setField("answer", v)} placeholder="e.g.  A,B,-,A  (use - for distractor items with no category)" mono />
                    <p className="text-xs text-zinc-400">
                      One category letter per item. Use <code className="bg-zinc-100 px-1 rounded font-mono">-</code> for items that don't belong in any category.
                      {(() => {
                        const itemCount = (form.df_items as string ?? "").split("\n").filter(s => s.trim()).length;
                        return itemCount > 0 ? ` (${itemCount} item${itemCount !== 1 ? "s" : ""} defined)` : "";
                      })()}
                    </p>
                  </div>
                ) : form.type === "in_passage_sentence_select" ? (
                  <div className="flex flex-col gap-1.5">
                    <Input value={form.answer ?? ""} onChange={v => setField("answer", v)} placeholder="e.g.  3  (the correct sentence number)" mono />
                    <p className="text-xs text-zinc-400">
                      1-based sentence number.
                      {(() => {
                        const sentCount = (form.pss_sentences as string ?? "").split("\n").filter(s => s.trim()).length;
                        return sentCount > 0 ? ` (${sentCount} sentence${sentCount !== 1 ? "s" : ""} defined)` : "";
                      })()}
                    </p>
                  </div>
                ) : form.type === "inline_text_span_click" ? (
                  <div className="flex flex-col gap-1.5">
                    <div className="grid grid-cols-4 gap-2">
                      {(["A", "B", "C", "D"] as const).map(letter => (
                        <button key={letter} type="button" onClick={() => setField("answer", letter)}
                          className={`px-3 py-2.5 rounded-xl border text-base font-bold transition-all ${
                            form.answer === letter ? "bg-amber-500 border-amber-400 text-zinc-950" : "bg-zinc-50 border-zinc-200 text-zinc-400 hover:border-amber-500/40 hover:text-zinc-700"
                          }`}
                        >
                          {letter}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-zinc-400">Select the letter of the correct span.</p>
                  </div>
                ) : (
                  <Input value={form.answer ?? ""} onChange={v => setField("answer", v)} placeholder="e.g. 42, 3/4, or 0.75" mono />
                )}
              </div>

              {/* Media — not relevant for these non-choice types */}
              {form.type !== "linear_graphing" && form.type !== "number_line_click" && form.type !== "table_row_radio" && (
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <Label>Media (optional)</Label>
                    <button type="button" onClick={addMediaItem} className="text-sm text-amber-500 hover:text-amber-400 font-medium transition-colors">
                      + Add media
                    </button>
                  </div>
                  {mediaItems.length === 0 ? (
                    <p className="text-sm text-zinc-400 italic">No media attached.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {mediaItems.map((item, idx) => (
                        <div key={idx} className="border border-zinc-200 rounded-xl p-3.5 flex flex-col gap-3 bg-zinc-50">
                          <div className="flex gap-2 items-end">
                            <div className="flex-1 flex flex-col gap-1">
                              <span className="text-sm font-bold uppercase tracking-widest text-zinc-500">Media ID</span>
                              <input type="text" value={item.mediaId} onChange={e => updateMediaItem(idx, { mediaId: e.target.value })} title="Media ID"
                                placeholder={`${form.uid ?? "UID"}_${String.fromCharCode(65 + idx)}`}
                                className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-1.5 text-sm font-mono text-zinc-700 placeholder-zinc-400 focus:outline-none focus:border-amber-500/60 transition-colors"
                              />
                            </div>
                            <div className="flex flex-col gap-1 w-36 shrink-0">
                              <span className="text-sm font-bold uppercase tracking-widest text-zinc-500">Type</span>
                              <select value={item.media_type} onChange={e => updateMediaItem(idx, { media_type: e.target.value as MediaType })} title="Media type"
                                className="w-full bg-white border border-zinc-300 rounded-lg px-2 py-1.5 text-sm text-zinc-700 focus:outline-none focus:border-amber-500/60 transition-colors">
                                {(Object.keys(MEDIA_TYPE_LABELS) as MediaType[]).map(t => (
                                  <option key={t} value={t}>{MEDIA_TYPE_LABELS[t]}</option>
                                ))}
                              </select>
                            </div>
                            <button type="button" onClick={() => removeMediaItem(idx)}
                              className="mb-0.5 w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors text-sm shrink-0">
                              ✕
                            </button>
                          </div>
                          {isImageType(item.media_type) ? (
                            <div className="flex flex-col gap-2">
                              {item.previewUrl && (
                                <img src={item.previewUrl} alt="preview"
                                  className="max-h-36 object-contain rounded-lg border border-zinc-200 bg-zinc-50 p-1"
                                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty("display", "block"); }}
                                />
                              )}
                              {item.previewUrl && (
                                <p className="hidden text-xs text-red-500 bg-red-50 border border-red-200 rounded px-2 py-1 break-all">
                                  Image failed to load — re-upload the file. URL: {item.previewUrl}
                                </p>
                              )}
                              <input type="file" accept="image/*" title="Upload image" placeholder="Upload image"
                                onChange={e => handleImageFile(idx, e.target.files?.[0])}
                                className="text-sm text-zinc-500 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-zinc-100 file:text-zinc-700 hover:file:bg-zinc-200 cursor-pointer"
                              />
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <textarea value={item.passageText} onChange={e => updateMediaItem(idx, { passageText: e.target.value, isExisting: false })}
                                placeholder="Paste or type the full passage text…" rows={5}
                                className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-sm text-zinc-700 placeholder-zinc-400 focus:outline-none focus:border-amber-500/60 transition-colors resize-y"
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <p className="text-sm text-zinc-500 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2">
                Saves to <span className="text-zinc-700 font-mono">all_questions</span> and topic table{" "}
                <span className="text-amber-500/80 font-mono">{form.sub_category || "<sub_category>"}</span>.
              </p>

              {saveError && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{saveError}</p>
              )}
            </div>{/* end left form column */}

            {/* ── Right: interactive preview ── */}
            <div className="w-80 shrink-0 flex flex-col overflow-hidden bg-slate-50 border-l border-zinc-200">
              {/* Header */}
              <div className="px-4 py-3 border-b border-zinc-200 bg-white shrink-0 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-zinc-700">Interactive Preview</p>
                    <p className="text-xs text-zinc-400">Test it as a student would</p>
                  </div>
                </div>
                {/* Live feedback badge — fades in when admin answers */}
                <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full transition-all duration-200 ${
                  previewResult === true
                    ? "bg-emerald-100 text-emerald-700 opacity-100 scale-100"
                    : previewResult === false
                    ? "bg-rose-100 text-rose-700 opacity-100 scale-100"
                    : "opacity-0 scale-95 pointer-events-none"
                }`}>
                  {previewResult === true ? "✓ Correct" : "✗ Wrong"}
                </span>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                {/* Media: passages + images */}
                {previewDisplayMedia.length > 0 && (
                  <div className="flex flex-col gap-3">
                    {previewDisplayMedia.map((item, idx) => (
                      item.media_type === "passage" ? (
                        <div key={idx} className="bg-white rounded-lg border border-slate-200 p-3 text-sm text-slate-700 leading-relaxed">
                          {parseFormattedText(item.passageText)}
                        </div>
                      ) : item.previewUrl ? (
                        <div key={idx} className="bg-white rounded-lg border border-slate-200 p-2 text-center">
                          <img src={item.previewUrl} alt={item.mediaId} className="max-w-full h-auto mx-auto"
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty("display", "block"); }}
                          />
                          <p className="hidden text-xs text-red-500 mt-1">⚠ Image failed — re-upload via Edit</p>
                        </div>
                      ) : (
                        <div key={idx} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 font-mono">
                          ⚠ {item.mediaId} — not uploaded yet
                        </div>
                      )
                    ))}
                  </div>
                )}

                {/* Question text */}
                <div className="text-sm leading-relaxed text-slate-800">
                  {form.text?.trim()
                    ? parseFormattedText(
                        form.text,
                        "",
                        form.type === "expression"
                          ? (form.variables as string ?? "").split(",").map(v => v.trim()).filter(Boolean)
                          : []
                      )
                    : <span className="text-zinc-400 italic">No question text yet.</span>}
                </div>

                {/* ── MCQ ── */}
                {form.type === "mcq" && (
                  <MCQuestion
                    key={previewResetKey}
                    option1={form.choice_1 as string ?? ""}
                    option2={form.choice_2 as string ?? ""}
                    option3={form.choice_3 as string ?? ""}
                    option4={form.choice_4 as string ?? ""}
                    chosenAnswer={setPreviewAnswer}
                    isReadOnly={false}
                    previousAnswer=""
                    choiceImages={previewChoiceImages}
                  />
                )}

                {/* ── Grid-in ── */}
                {form.type === "grid-in" && (
                  <GridInQuestion
                    key={previewResetKey}
                    chosenAnswer={setPreviewAnswer}
                    isReadOnly={false}
                    previousAnswer=""
                  />
                )}

                {/* ── Multi-select ── */}
                {form.type === "multi-select" && (() => {
                  const opts = (
                    [form.choice_1, form.choice_2, form.choice_3, form.choice_4, form.choice_5, form.choice_6] as (string | undefined)[]
                  ).map(v => v?.trim() ?? "").filter(Boolean);
                  return (
                    <MultiSelectQuestion
                      key={previewResetKey}
                      options={opts}
                      selectCount={Number(form.select_count) || 1}
                      chosenAnswer={setPreviewAnswer}
                      isReadOnly={false}
                      previousAnswer=""
                      choiceImages={previewChoiceImages}
                    />
                  );
                })()}

                {/* ── Expression ── */}
                {form.type === "expression" && (
                  <ExpressionEditorQuestion
                    key={previewResetKey}
                    chosenAnswer={setPreviewAnswer}
                    isReadOnly={false}
                    variables={(form.variables as string ?? "").split(",").map(v => v.trim()).filter(Boolean)}
                  />
                )}

                {/* ── Inline-dropdown ── */}
                {form.type === "inline-dropdown" && (() => {
                  const hasBlank = (form.text ?? "").includes("[BLANK]");
                  if (!hasBlank) return (
                    <p className="text-xs text-slate-400 italic px-1">
                      Add <code className="bg-zinc-100 px-1 rounded font-mono">[BLANK]</code> to the question text above to preview the dropdown.
                    </p>
                  );
                  return (
                    <InlineDropdownQuestion
                      key={previewResetKey}
                      text={form.text ?? ""}
                      options={([form.choice_1, form.choice_2, form.choice_3, form.choice_4] as string[]).filter(Boolean)}
                      chosenAnswer={setPreviewAnswer}
                      isReadOnly={false}
                      previousAnswer=""
                      answer=""
                    />
                  );
                })()}

                {/* ── Linear graphing ── */}
                {form.type === "linear_graphing" && (
                  <div className="overflow-x-auto -mx-1 px-1">
                    <SHSATGrapher
                      key={previewResetKey}
                      onAnswerChange={setPreviewAnswer}
                      isReadOnly={false}
                    />
                  </div>
                )}

                {/* ── Table row radio ── */}
                {form.type === "table_row_radio" && (() => {
                  const cols = (form.tr_col_headers as string ?? "")
                    .split(",").map((s: string) => s.trim()).filter(Boolean);
                  const rowsArr = (form.tr_rows as string ?? "")
                    .split("\n").map((s: string) => s.trim()).filter(Boolean);
                  if (cols.length === 0 || rowsArr.length === 0) return (
                    <p className="text-xs text-slate-400 italic px-1">
                      Enter column headers and row labels above to preview.
                    </p>
                  );
                  return (
                    <TableRowRadio
                      key={previewResetKey}
                      colHeaders={cols}
                      rows={rowsArr}
                      chosenAnswer={setPreviewAnswer}
                      isReadOnly={false}
                      previousAnswer=""
                    />
                  );
                })()}

                {/* ── Number line click ── */}
                {form.type === "number_line_click" && (
                  <div className="overflow-x-auto -mx-1 px-1">
                    <NumberLineClick
                      key={previewResetKey}
                      min={parseFloat((form.nl_min as string) || "-10")}
                      max={parseFloat((form.nl_max as string) || "10")}
                      step={parseFloat((form.nl_step as string) || "1")}
                      onAnswerChange={setPreviewAnswer}
                      isReadOnly={false}
                    />
                  </div>
                )}

                {/* ── Drag fill single ── */}
                {form.type === "drag_fill_single" && form.text?.includes("[BLANK]") && (
                  <DragFillSingle
                    key={previewResetKey}
                    text={form.text ?? ""}
                    options={[form.choice_1 ?? "", form.choice_2 ?? "", form.choice_3 ?? "", form.choice_4 ?? ""].filter(Boolean)}
                    chosenAnswer={setPreviewAnswer}
                    isReadOnly={false}
                  />
                )}
                {form.type === "drag_fill_single" && !form.text?.includes("[BLANK]") && (
                  <p className="text-sm text-zinc-400 italic">Add <code className="bg-zinc-100 px-1 rounded font-mono">[BLANK]</code> to the question text and token tiles A–D to see the preview.</p>
                )}

                {/* ── Drag fill multiple ── */}
                {form.type === "drag_fill_multiple" && /\[BLANK_\d+\]/.test(form.text ?? "") && (
                  <DragFillMultiple
                    key={previewResetKey}
                    text={form.text ?? ""}
                    options={[
                      form.choice_1 ?? "", form.choice_2 ?? "", form.choice_3 ?? "",
                      form.choice_4 ?? "", (form.choice_5 as string) ?? "", (form.choice_6 as string) ?? "",
                    ].filter(Boolean)}
                    chosenAnswer={setPreviewAnswer}
                    isReadOnly={false}
                  />
                )}
                {form.type === "drag_fill_multiple" && !/\[BLANK_\d+\]/.test(form.text ?? "") && (
                  <p className="text-sm text-zinc-400 italic">Add <code className="bg-zinc-100 px-1 rounded font-mono">[BLANK_1]</code>, <code className="bg-zinc-100 px-1 rounded font-mono">[BLANK_2]</code>, … to the text and token tiles A–D to see the preview.</p>
                )}

                {/* ── Drag to bin ── */}
                {form.type === "drag_to_bin" && (() => {
                  const items = (form.df_items as string ?? "").split("\n").map((s: string) => s.trim()).filter(Boolean);
                  const bins  = (form.df_bins  as string ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
                  if (items.length === 0 || bins.length === 0) return (
                    <p className="text-sm text-zinc-400 italic">Enter item chips (one per line) and bin labels above to preview.</p>
                  );
                  return (
                    <DragToBin
                      key={previewResetKey}
                      items={items}
                      bins={bins}
                      chosenAnswer={setPreviewAnswer}
                      isReadOnly={false}
                    />
                  );
                })()}

                {/* ── Drag to categorize ── */}
                {form.type === "drag_to_categorize" && (() => {
                  const items = (form.df_items as string ?? "").split("\n").map((s: string) => s.trim()).filter(Boolean);
                  const bins  = (form.df_bins  as string ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
                  if (items.length === 0 || bins.length === 0) return (
                    <p className="text-sm text-zinc-400 italic">Enter item chips (one per line) and category labels above to preview.</p>
                  );
                  return (
                    <DragToCategorize
                      key={previewResetKey}
                      items={items}
                      bins={bins}
                      chosenAnswer={setPreviewAnswer}
                      isReadOnly={false}
                    />
                  );
                })()}

                {form.type === "in_passage_sentence_select" && (() => {
                  const sentences = (form.pss_sentences as string ?? "").split("\n").map((s: string) => s.trim()).filter(Boolean);
                  if (sentences.length === 0) return (
                    <p className="text-sm text-zinc-400 italic">Enter passage sentences (one per line) above to preview.</p>
                  );
                  return (
                    <PassageSentenceSelect
                      key={previewResetKey}
                      sentences={sentences}
                      chosenAnswer={setPreviewAnswer}
                      isReadOnly={false}
                    />
                  );
                })()}

                {form.type === "inline_text_span_click" && (() => {
                  const passage = (form.span_passage as string ?? "").trim();
                  if (!passage) return (
                    <p className="text-sm text-zinc-400 italic">Enter passage text with [SPAN_A]...[/SPAN_A] markers above to preview.</p>
                  );
                  return (
                    <InlineTextSpanClick
                      key={previewResetKey}
                      passage={passage}
                      chosenAnswer={setPreviewAnswer}
                      isReadOnly={false}
                    />
                  );
                })()}

                {/* ── Answer key + reset footer ── */}
                {form.answer && (
                  <div className="mt-2 pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider shrink-0">Answer</span>
                      <code className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-mono truncate max-w-36">
                        {form.answer}
                      </code>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setPreviewAnswer(""); setPreviewResetKey(k => k + 1); }}
                      className={`shrink-0 text-[11px] font-semibold transition-all duration-150 ${
                        previewAnswer
                          ? "text-slate-500 hover:text-slate-800"
                          : "text-slate-300 pointer-events-none"
                      }`}
                    >
                      Reset ↺
                    </button>
                  </div>
                )}
              </div>
            </div>{/* end right preview column */}
            </div>{/* end two-column row */}

            <div className="px-6 py-4 border-t border-zinc-200 flex items-center justify-between shrink-0">
              <button type="button" onClick={closeModal}
                className="px-4 py-2 rounded-lg text-base text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors">
                Cancel
              </button>
              <button type="button" onClick={save} disabled={saving}
                className="px-6 py-2 rounded-lg text-base font-bold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-colors disabled:opacity-50">
                {saving ? "Saving…" : modalMode === "add" ? "Add Question" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
