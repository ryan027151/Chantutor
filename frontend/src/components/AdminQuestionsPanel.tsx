import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabase-client";

type MediaType = "passage" | "graph" | "table" | "equation";
type QuestionType = "mcq" | "grid-in" | "linear_graphing";

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
}

type FormData = Partial<Question>;

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
  answer: "",
  media_refs: "",
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

// ── Type badge helper ──────────────────────────────────────────────────────────

function TypeBadge({ type, source }: { type: string; source?: string }) {
  const label = type === "mcq" ? "MCQ" : type === "grid-in" ? "Grid-in" : "Graphing";
  const cls =
    type === "mcq"
      ? "bg-zinc-100 text-zinc-500"
      : type === "grid-in"
      ? "bg-amber-500/10 text-amber-500"
      : "bg-blue-500/10 text-blue-600";
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

function GenerateModal({ onClose, onSuccess }: GenerateModalProps) {
  const [genType, setGenType] = useState<QuestionType>("mcq");
  const [genCount, setGenCount] = useState(10);
  const [genDifficulty, setGenDifficulty] = useState("mixed");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ generated: number; approved: number; pending: number; duplicates_skipped: number } | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setGenError(null);
    setResult(null);
    const { data, error } = await supabase.functions.invoke("generate-questions", {
      body: { type: genType, count: genCount, difficulty: genDifficulty },
    });
    setGenerating(false);
    if (error || data?.error) {
      setGenError(data?.error ?? error?.message ?? "Unknown error");
      return;
    }
    setResult({ generated: data.generated ?? 0, approved: data.approved ?? data.generated ?? 0, pending: data.pending ?? 0, duplicates_skipped: data.duplicates_skipped ?? 0 });
    onSuccess();
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-zinc-200 rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-lg font-bold text-zinc-900">Generate AI Questions</h3>
            <p className="text-sm text-zinc-400 mt-0.5">Uses Claude to write SHSAT-style math questions</p>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors text-base">
            ✕
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5">
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
              {/* Question type */}
              <div className="flex flex-col gap-1.5">
                <Label>Question Type</Label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: "mcq",             label: "Math MCQ"    },
                    { value: "grid-in",          label: "Grid-in"     },
                    { value: "linear_graphing",  label: "Graphing"    },
                  ] as { value: QuestionType; label: string }[]).map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setGenType(opt.value)}
                      className={`py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                        genType === opt.value
                          ? "bg-amber-500 border-amber-400 text-zinc-950"
                          : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:border-amber-500/40"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Count */}
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

              {/* Difficulty */}
              <div className="flex flex-col gap-1.5">
                <Label>Difficulty</Label>
                <div className="grid grid-cols-4 gap-2">
                  {["mixed", "easy", "medium", "hard"].map(d => (
                    <button key={d} type="button"
                      onClick={() => setGenDifficulty(d)}
                      className={`py-2 rounded-xl border text-sm font-bold capitalize transition-all ${
                        genDifficulty === d
                          ? "bg-amber-500 border-amber-400 text-zinc-950"
                          : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:border-amber-500/40"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cost estimate */}
              <p className="text-xs text-zinc-400 bg-zinc-50 border border-zinc-100 rounded-lg px-3 py-2">
                Estimated cost: ~${(genCount * (genType === "linear_graphing" ? 0.03 : 0.04)).toFixed(2)} USD using Claude Opus
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
  onEditHandled?: () => void;
}

export default function AdminQuestionsPanel({ initialEditUid, onEditHandled }: AdminQuestionsPanelProps = {}) {
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
  const [showGenerate, setShowGenerate] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [originalSubCategory, setOriginalSubCategory] = useState<string | null>(null);
  const [isNewTopic, setIsNewTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [originalForm, setOriginalForm] = useState<FormData | null>(null);

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

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    let q = supabase
      .from("all_questions")
      .select(
        "uid, type, text, choice_1, choice_2, choice_3, choice_4, answer, subject, sub_category, difficulty, media_refs, source, status",
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

  // When navigated here from the Reports panel, auto-open the edit modal for the flagged question
  useEffect(() => {
    if (!initialEditUid) return;
    (async () => {
      const { data } = await supabase
        .from("all_questions")
        .select("uid, type, text, choice_1, choice_2, choice_3, choice_4, answer, subject, sub_category, difficulty, media_refs, source, status")
        .eq("uid", initialEditUid)
        .single();
      if (data) openEdit(data as Question);
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
    setModalMode("add");
  }

  async function openEdit(q: Question) {
    setForm({ ...q });
    setOriginalForm({ ...q });
    setOriginalSubCategory(q.sub_category ?? null);
    setIsNewTopic(false);
    setNewTopicName("");
    setMediaItems([]);
    setSaveError(null);
    setModalMode("edit");

    const { data } = await supabase
      .from("dictionary_of_media")
      .select("media_id, media_type, content, index")
      .eq("question_id", q.uid)
      .order("index");

    if (data && data.length > 0) {
      setMediaItems(data.map((m: { media_id: string; media_type: MediaType; content: string; index: number }) => ({
        mediaId: m.media_id,
        media_type: m.media_type ?? "graph",
        file: null,
        passageText: m.media_type === "passage" ? (m.content ?? "") : "",
        previewUrl: m.media_type !== "passage" ? (m.content ?? "") : "",
        isExisting: true,
        _origId: m.media_id,
        _origType: m.media_type ?? "graph",
        _origContent: m.content ?? "",
      })));
    } else if (q.media_refs?.trim()) {
      setMediaItems(q.media_refs.split(/[,\s]+/).filter(Boolean).map(id => ({
        mediaId: id.trim(), media_type: "graph" as MediaType,
        file: null, passageText: "", previewUrl: "", isExisting: true,
      })));
    }
  }

  async function save() {
    if (!form.uid?.trim()) { setSaveError("UID is required."); return; }
    if (!form.text?.trim()) { setSaveError("Question text is required."); return; }
    if (!form.answer?.trim()) { setSaveError("Answer is required."); return; }
    if (!form.sub_category?.trim()) { setSaveError("Topic table (sub_category) is required."); return; }

    setSaving(true);
    setSaveError(null);

    // Duplicate media ID check — warn if two different items share the same ID
    const nonEmptyIds = mediaItems.map(m => m.mediaId.trim()).filter(Boolean);
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

    const mediaRefsStr = mediaItems.map(m => m.mediaId.trim()).filter(Boolean).join(", ") || null;

    // Fields for all_questions — uid only used for INSERT, not in UPDATE SET
    const fields = {
      type: form.type ?? "mcq",
      subject: form.subject || null,
      sub_category: form.sub_category,
      difficulty: form.difficulty || null,
      text: form.text,
      choice_1: form.type === "linear_graphing" ? null : (form.choice_1 || null),
      choice_2: form.type === "linear_graphing" ? null : (form.choice_2 || null),
      choice_3: form.type === "linear_graphing" ? null : (form.choice_3 || null),
      choice_4: form.type === "linear_graphing" ? null : (form.choice_4 || null),
      answer: form.answer,
      media_refs: mediaRefsStr,
      source: form.source || "bank",
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

    for (let i = 0; i < mediaItems.length; i++) {
      const item = mediaItems[i];

      // Determine what changed
      const hasNewFile = isImageType(item.media_type) && item.file !== null;
      const passageChanged = item.media_type === "passage" &&
        item.passageText.trim() !== (item._origContent ?? "").trim();
      const idChanged = item.isExisting && !!item._origId && item._origId !== item.mediaId.trim();
      const typeChanged = item.isExisting && !!item._origType && item._origType !== item.media_type;

      const needsSave = hasNewFile || passageChanged || !item.isExisting || idChanged || typeChanged;
      if (!needsSave) continue;

      let content: string | null = null;

      if (hasNewFile) {
        const ext = item.file!.name.split(".").pop() ?? "jpg";
        const filePath = `${item.mediaId.trim()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("images")
          .upload(filePath, item.file!, { upsert: true });
        if (uploadErr) {
          setSaveError(`Image upload failed for "${item.mediaId}": ${uploadErr.message}. Question was saved.`);
          setSaving(false);
          return;
        }
        const { data: urlData } = supabase.storage.from("images").getPublicUrl(filePath);
        content = urlData.publicUrl;
      } else if (item.media_type === "passage") {
        content = item.passageText.trim() || null;
      } else {
        // Image type, no new file (type or ID changed) — keep the existing URL
        content = item.previewUrl || null;
      }

      // If the media ID was renamed, remove the old DB record first
      if (idChanged && item._origId) {
        await supabase.from("dictionary_of_media").delete().eq("media_id", item._origId);
      }

      if (content !== null) {
        const { error: dictErr } = await supabase.from("dictionary_of_media").upsert(
          { media_id: item.mediaId.trim(), question_id: form.uid, media_type: item.media_type, content, index: i },
          { onConflict: "media_id" }
        );
        if (dictErr) {
          setSaveError(`Media record failed for "${item.mediaId}": ${dictErr.message}. Question was saved.`);
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

    setModalMode(null);
    fetchQuestions();
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

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* ── Toolbar ── */}
      <div className="px-6 py-4 border-b border-zinc-200 flex items-center gap-3 flex-wrap shrink-0">
        <div className="shrink-0 mr-2">
          <h2 className="text-base font-bold text-zinc-900">Question Bank</h2>
          <p className="text-sm text-zinc-400">{total} questions</p>
        </div>

        <input
          type="search"
          placeholder="Search by UID or question text…"
          value={searchInput}
          onChange={e => handleSearchChange(e.target.value)}
          className="flex-1 min-w-44 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-base text-zinc-700 placeholder-zinc-400 focus:outline-none focus:border-amber-500/40 transition-colors"
        />

        <select title="Filter by subject" value={filterSubject} onChange={e => { setFilterSubject(e.target.value); setPage(0); }}
          className="bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-base text-zinc-600 focus:outline-none focus:border-amber-500/40 transition-colors">
          <option value="">All Subjects</option>
          <option value="english">English</option>
          <option value="math">Math</option>
        </select>

        <select title="Filter by type" value={filterType} onChange={e => { setFilterType(e.target.value); setPage(0); }}
          className="bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-base text-zinc-600 focus:outline-none focus:border-amber-500/40 transition-colors">
          <option value="">All Types</option>
          <option value="mcq">MCQ</option>
          <option value="grid-in">Grid-in</option>
          <option value="linear_graphing">Graphing</option>
        </select>

        <select title="Filter by source" value={filterSource} onChange={e => { setFilterSource(e.target.value); setPage(0); }}
          className="bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-base text-zinc-600 focus:outline-none focus:border-amber-500/40 transition-colors">
          <option value="">All Sources</option>
          <option value="bank">Question Bank</option>
          <option value="ai">AI Generated</option>
        </select>

        <div className="relative">
          <select title="Filter by status" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(0); }}
            className="bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-base text-zinc-600 focus:outline-none focus:border-amber-500/40 transition-colors">
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
          className="bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-base text-zinc-600 focus:outline-none focus:border-amber-500/40 transition-colors">
          <option value="">All Topics</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button type="button" onClick={() => setShowGenerate(true)}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm px-4 py-2 rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Generate AI
          </button>
          <button type="button" onClick={openAdd}
            className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-base px-4 py-2 rounded-lg transition-colors">
            + Add Question
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
          <div className="bg-white border border-zinc-200 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
            <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-zinc-900">
                  {modalMode === "add" ? "Add New Question" : "Edit Question"}
                </h3>
                {modalMode === "edit" && (
                  <p className="text-sm text-zinc-400 font-mono mt-0.5">{form.uid}</p>
                )}
              </div>
              <button type="button" onClick={() => setModalMode(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors text-base">
                ✕
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 flex flex-col gap-5">
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
                    }}
                    title="Question type"
                  >
                    <option value="mcq">MCQ</option>
                    <option value="grid-in">Grid-in</option>
                    <option value="linear_graphing">Linear Graphing</option>
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
                <Textarea value={form.text ?? ""} onChange={v => setField("text", v)} placeholder="Type the full question text here…" rows={6} />
              </div>

              {/* Answer choices — only for MCQ */}
              {form.type === "mcq" && (
                <div className="flex flex-col gap-2.5">
                  <Label>Answer Choices</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {(["choice_1", "choice_2", "choice_3", "choice_4"] as const).map((key, i) => (
                      <div key={key} className="flex gap-2 items-center">
                        <span className="text-sm font-bold text-zinc-400 w-5 shrink-0">{String.fromCharCode(65 + i)}</span>
                        <Input value={(form[key] as string) ?? ""} onChange={v => setField(key, v)} placeholder={`Choice ${String.fromCharCode(65 + i)}`} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label>Correct Answer</Label>
                {form.type === "mcq" ? (
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
                ) : (
                  <Input value={form.answer ?? ""} onChange={v => setField("answer", v)} placeholder="e.g. 42, 3/4, or 0.75" mono />
                )}
              </div>

              {/* Media — not relevant for linear_graphing but allow it for edge cases */}
              {form.type !== "linear_graphing" && (
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
                                <img src={item.previewUrl} alt="preview" className="max-h-36 object-contain rounded-lg border border-zinc-200 bg-zinc-50 p-1" />
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
            </div>

            <div className="px-6 py-4 border-t border-zinc-200 flex items-center justify-between shrink-0">
              <button type="button" onClick={() => setModalMode(null)}
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
