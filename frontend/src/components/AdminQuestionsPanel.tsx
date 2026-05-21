import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabase-client";

type MediaType = "passage" | "graph" | "table" | "equation";

interface MediaItem {
  mediaId: string;
  media_type: MediaType;
  file: File | null;
  passageText: string;
  previewUrl: string; // object URL for new uploads, or existing content URL
  isExisting: boolean;
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
  type: "mcq" | "grid-in";
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

// ── Reusable field components ─────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold uppercase tracking-widest text-slate-500">{children}</span>
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
      className={`w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${mono ? "font-mono" : ""}`}
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
      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/25 transition-colors resize-y"
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
      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-base text-slate-900 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/25 transition-colors"
    >
      {children}
    </select>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminQuestionsPanel() {
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

  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [originalSubCategory, setOriginalSubCategory] = useState<string | null>(null);
  const [isNewTopic, setIsNewTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null);
  const [deleting, setDeleting] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearchChange(v: string) {
    setSearchInput(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(v); setPage(0); }, 400);
  }

  // Load distinct sub_categories for filter dropdown
  useEffect(() => {
    supabase.from("all_questions").select("sub_category").then(({ data }) => {
      if (!data) return;
      const unique = [...new Set(
        data.map((r: { sub_category: string | null }) => r.sub_category).filter(Boolean)
      )].sort() as string[];
      setCategories(unique);
    });
  }, []);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    let q = supabase
      .from("all_questions")
      .select(
        "uid, type, text, choice_1, choice_2, choice_3, choice_4, answer, subject, sub_category, difficulty, media_refs",
        { count: "exact" }
      )
      .order("uid", { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (filterSubject) q = q.eq("subject", filterSubject);
    if (filterType) q = q.eq("type", filterType);
    if (filterCategory) q = q.eq("sub_category", filterCategory);
    if (search.trim()) q = q.or(`uid.ilike.%${search.trim()}%,text.ilike.%${search.trim()}%`);

    const { data, count, error } = await q;
    if (error) setFetchError(error.message);
    else { setQuestions((data as Question[]) ?? []); setTotal(count ?? 0); }
    setLoading(false);
  }, [page, filterSubject, filterType, filterCategory, search]);

  useEffect(() => { fetchQuestions(); }, [fetchQuestions]);

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
    setOriginalSubCategory(q.sub_category ?? null);
    setIsNewTopic(false);
    setNewTopicName("");
    setMediaItems([]);
    setSaveError(null);
    setModalMode("edit");

    // Load existing media from dictionary_of_media
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
      })));
    } else if (q.media_refs?.trim()) {
      // Fallback: parse media_refs string if no DB records found
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

    // If a brand-new topic table was requested, create it via RPC first
    if (isNewTopic && form.sub_category?.trim()) {
      const { error: rpcErr } = await supabase.rpc("create_topic_table", { table_name: form.sub_category.trim() });
      if (rpcErr) {
        setSaveError(`Could not create topic table "${form.sub_category}": ${rpcErr.message}`);
        setSaving(false);
        return;
      }
    }

    const mediaRefsStr = mediaItems.map(m => m.mediaId.trim()).filter(Boolean).join(", ") || null;

    const payload = {
      uid: form.uid,
      type: form.type ?? "mcq",
      subject: form.subject || null,
      sub_category: form.sub_category,
      difficulty: form.difficulty || null,
      text: form.text,
      choice_1: form.choice_1 || null,
      choice_2: form.choice_2 || null,
      choice_3: form.choice_3 || null,
      choice_4: form.choice_4 || null,
      answer: form.answer,
      media_refs: mediaRefsStr,
    };

    const { error: allQErr } = modalMode === "add"
      ? await supabase.from("all_questions").insert([payload])
      : await supabase.from("all_questions").update(payload).eq("uid", form.uid!);

    if (allQErr) { setSaveError(`all_questions error: ${allQErr.message}`); setSaving(false); return; }

    if (modalMode === "add") {
      const { error: topicErr } = await supabase.from(form.sub_category!).insert([payload]);
      if (topicErr) {
        setSaveError(`Topic table "${form.sub_category}" error: ${topicErr.message}. all_questions was updated.`);
        setSaving(false);
        return;
      }
    } else {
      const subCategoryChanged = originalSubCategory && originalSubCategory !== form.sub_category;
      if (subCategoryChanged) {
        // Remove from old topic table, insert into new topic table
        await supabase.from(originalSubCategory!).delete().eq("uid", form.uid!);
        const { error: topicErr } = await supabase.from(form.sub_category!).insert([payload]);
        if (topicErr) {
          setSaveError(`New topic table "${form.sub_category}" error: ${topicErr.message}. all_questions and old topic table were updated.`);
          setSaving(false);
          return;
        }
      } else {
        const { error: topicErr } = await supabase.from(form.sub_category!).update(payload).eq("uid", form.uid!);
        if (topicErr) {
          setSaveError(`Topic table "${form.sub_category}" error: ${topicErr.message}. all_questions was updated.`);
          setSaving(false);
          return;
        }
      }
    }

    if (modalMode === "add" && !categories.includes(form.sub_category!)) {
      setCategories(prev => [...prev, form.sub_category!].sort());
    }

    // Upload media to Storage + upsert into dictionary_of_media
    for (let i = 0; i < mediaItems.length; i++) {
      const item = mediaItems[i];
      let content: string | null = null;

      if (isImageType(item.media_type) && item.file) {
        // Upload image to Storage → images bucket, named by media_id
        const ext = item.file.name.split(".").pop() ?? "jpg";
        const filePath = `${item.mediaId}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("images")
          .upload(filePath, item.file, { upsert: true });
        if (uploadErr) {
          setSaveError(`Image upload failed for "${item.mediaId}": ${uploadErr.message}. Question was saved.`);
          setSaving(false);
          return;
        }
        const { data: urlData } = supabase.storage.from("images").getPublicUrl(filePath);
        content = urlData.publicUrl;
      } else if (item.media_type === "passage" && !item.isExisting && item.passageText.trim()) {
        content = item.passageText.trim();
      } else if (item.isExisting) {
        // Existing item with no new file/text — still upsert to keep index/question_id in sync
        content = item.media_type === "passage" ? item.passageText : item.previewUrl;
      }

      if (content !== null) {
        const { error: dictErr } = await supabase.from("dictionary_of_media").upsert(
          {
            media_id: item.mediaId,
            question_id: form.uid,
            media_type: item.media_type,
            content,
            index: i,
          },
          { onConflict: "media_id" }
        );
        if (dictErr) {
          setSaveError(`Media record failed for "${item.mediaId}": ${dictErr.message}. Question was saved.`);
          setSaving(false);
          return;
        }
      }
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
      <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3 flex-wrap shrink-0">
        <div className="shrink-0 mr-2">
          <h2 className="text-base font-bold text-slate-900">Question Bank</h2>
          <p className="text-sm text-slate-400">{total} questions</p>
        </div>

        <input
          type="search"
          placeholder="Search by UID or question text…"
          value={searchInput}
          onChange={e => handleSearchChange(e.target.value)}
          className="flex-1 min-w-44 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-base text-slate-700 placeholder-slate-400 focus:outline-none focus:border-amber-500/40 transition-colors"
        />

        <select title="Filter by subject" value={filterSubject} onChange={e => { setFilterSubject(e.target.value); setPage(0); }}
          className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-base text-slate-600 focus:outline-none focus:border-amber-500/40 transition-colors">
          <option value="">All Subjects</option>
          <option value="english">ELA</option>
          <option value="math">Math</option>
        </select>

        <select title="Filter by type" value={filterType} onChange={e => { setFilterType(e.target.value); setPage(0); }}
          className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-base text-slate-600 focus:outline-none focus:border-amber-500/40 transition-colors">
          <option value="">All Types</option>
          <option value="mcq">MCQ</option>
          <option value="grid-in">Grid-in</option>
        </select>

        <select title="Filter by topic" value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(0); }}
          className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-base text-slate-600 focus:outline-none focus:border-amber-500/40 transition-colors">
          <option value="">All Topics</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <button type="button" onClick={openAdd}
          className="ml-auto shrink-0 bg-amber-500 hover:bg-amber-400 text-white font-bold text-base px-4 py-2 rounded-lg transition-colors">
          + Add Question
        </button>
      </div>

      {fetchError && (
        <div className="mx-5 mt-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-base text-red-500 shrink-0">{fetchError}</div>
      )}

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-base border-collapse">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="border-b border-slate-200">
              <th className="px-4 py-3 text-left text-sm font-bold text-slate-400 uppercase tracking-widest">UID</th>
              <th className="px-4 py-3 text-left text-sm font-bold text-slate-400 uppercase tracking-widest">Subject</th>
              <th className="px-4 py-3 text-left text-sm font-bold text-slate-400 uppercase tracking-widest">Type</th>
              <th className="px-4 py-3 text-left text-sm font-bold text-slate-400 uppercase tracking-widest">Topic</th>
              <th className="px-4 py-3 text-left text-sm font-bold text-slate-400 uppercase tracking-widest">Difficulty</th>
              <th className="px-4 py-3 text-left text-sm font-bold text-slate-400 uppercase tracking-widest w-full">Question</th>
              <th className="px-4 py-3 text-right text-sm font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-16 text-center text-slate-400 text-base">Loading…</td></tr>
            ) : questions.length === 0 ? (
              <tr><td colSpan={7} className="py-16 text-center text-slate-400 text-base">No questions match the current filters.</td></tr>
            ) : questions.map(q => (
              <tr key={q.uid} className="border-b border-slate-100 hover:bg-slate-50 transition-colors group">
                <td className="px-4 py-3 font-mono text-sm text-slate-400 whitespace-nowrap align-top">{q.uid}</td>
                <td className="px-4 py-3 align-top">
                  {q.subject
                    ? <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${q.subject === "english" ? "bg-blue-50 text-blue-600" : "bg-violet-50 text-violet-600"}`}>
                        {q.subject === "english" ? "ELA" : "Math"}
                      </span>
                    : <span className="text-slate-400 text-sm">—</span>}
                </td>
                <td className="px-4 py-3 align-top">
                  <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${q.type === "mcq" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-600"}`}>
                    {q.type === "mcq" ? "MCQ" : "Grid-in"}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-sm text-slate-400 whitespace-nowrap align-top">{q.sub_category ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-slate-400 capitalize align-top">{q.difficulty ?? "—"}</td>
                <td className="px-4 py-3 align-top max-w-lg">
                  <p className="text-sm text-slate-500 leading-relaxed line-clamp-2">{q.text}</p>
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="flex gap-1.5 justify-end">
                    <button type="button" onClick={() => openEdit(q)}
                      className="text-sm font-medium text-slate-400 hover:text-amber-600 px-3 py-1.5 rounded-md hover:bg-amber-50 border border-slate-200 hover:border-amber-200 transition-colors whitespace-nowrap">
                      Edit
                    </button>
                    {deleteTarget?.uid === q.uid ? (
                      <div className="flex gap-1">
                        <button type="button" onClick={confirmDelete} disabled={deleting}
                          className="text-sm font-medium text-white bg-red-600 hover:bg-red-500 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50">
                          {deleting ? "…" : "Confirm"}
                        </button>
                        <button type="button" onClick={() => setDeleteTarget(null)}
                          className="text-sm text-slate-400 hover:text-slate-700 px-2 py-1.5 rounded-md hover:bg-slate-100 transition-colors">
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setDeleteTarget(q)}
                        className="text-sm font-medium text-slate-400 hover:text-red-500 px-3 py-1.5 rounded-md hover:bg-red-50 border border-slate-200 hover:border-red-200 transition-colors">
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
      <div className="px-6 py-3 border-t border-slate-200 flex items-center justify-between shrink-0">
        <span className="text-sm text-slate-400">
          {total === 0 ? "No results" : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total}`}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="px-3 py-1.5 text-sm rounded-md bg-slate-50 border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300 disabled:opacity-30 transition-colors">
            ← Prev
          </button>
          <span className="text-sm text-slate-400 tabular-nums">{page + 1} / {Math.max(1, totalPages)}</span>
          <button type="button" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE_SIZE >= total}
            className="px-3 py-1.5 text-sm rounded-md bg-slate-50 border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300 disabled:opacity-30 transition-colors">
            Next →
          </button>
        </div>
      </div>

      {/* ── Add / Edit Modal ── */}
      {modalMode && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {modalMode === "add" ? "Add New Question" : "Edit Question"}
                </h3>
                {modalMode === "edit" && (
                  <p className="text-sm text-slate-400 font-mono mt-0.5">{form.uid}</p>
                )}
              </div>
              <button type="button" onClick={() => setModalMode(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors text-base">
                ✕
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 p-6 flex flex-col gap-5">
              {/* Row 1: UID / Subject / Type */}
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>UID</Label>
                  <Input
                    value={form.uid ?? ""}
                    onChange={v => setField("uid", v)}
                    placeholder="e.g. 25A_Q1"
                    disabled={modalMode === "edit"}
                    mono
                    autoFocus={modalMode === "add"}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Subject</Label>
                  <Select value={form.subject ?? ""} onChange={v => setField("subject", v)} title="Subject">
                    <option value="">—</option>
                    <option value="english">English / ELA</option>
                    <option value="math">Math</option>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Type</Label>
                  <Select value={form.type ?? "mcq"} onChange={v => setField("type", v as "mcq" | "grid-in")} title="Question type">
                    <option value="mcq">MCQ</option>
                    <option value="grid-in">Grid-in</option>
                  </Select>
                </div>
              </div>

              {/* Row 2: Topic / Difficulty */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Topic Table</Label>
                    {!isNewTopic ? (
                      <button
                        type="button"
                        onClick={() => { setIsNewTopic(true); setField("sub_category", ""); setNewTopicName(""); }}
                        className="text-sm text-amber-500 hover:text-amber-600 font-medium transition-colors"
                      >
                        + New topic
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setIsNewTopic(false); setNewTopicName(""); setField("sub_category", ""); }}
                        className="text-sm text-slate-400 hover:text-slate-600 font-medium transition-colors"
                      >
                        ← Pick existing
                      </button>
                    )}
                  </div>
                  {isNewTopic ? (
                    <div className="flex flex-col gap-1">
                      <Input
                        value={newTopicName}
                        onChange={v => { setNewTopicName(v); setField("sub_category", v.trim().toLowerCase().replace(/\s+/g, "_")); }}
                        placeholder="e.g. idioms (creates new table)"
                        mono
                        autoFocus
                      />
                      <p className="text-sm text-slate-400">Creates a new Postgres table with this name.</p>
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

              {/* Question text */}
              <div className="flex flex-col gap-1.5">
                <Label>Question Text</Label>
                <Textarea
                  value={form.text ?? ""}
                  onChange={v => setField("text", v)}
                  placeholder="Type the full question text here…"
                  rows={6}
                />
              </div>

              {/* Answer choices — MCQ only */}
              {form.type === "mcq" && (
                <div className="flex flex-col gap-2.5">
                  <Label>Answer Choices</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {(["choice_1", "choice_2", "choice_3", "choice_4"] as const).map((key, i) => (
                      <div key={key} className="flex gap-2 items-center">
                        <span className="text-sm font-bold text-slate-400 w-5 shrink-0">{String.fromCharCode(65 + i)}</span>
                        <Input
                          value={(form[key] as string) ?? ""}
                          onChange={v => setField(key, v)}
                          placeholder={`Choice ${String.fromCharCode(65 + i)}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Correct answer */}
              <div className="flex flex-col gap-1.5">
                <Label>Correct Answer</Label>
                {form.type === "mcq" ? (
                  <div className="grid grid-cols-4 gap-2">
                    {(["A", "B", "C", "D"] as const).map((letter, i) => {
                      const choiceKey = `choice_${i + 1}` as keyof FormData;
                      const choiceText = (form[choiceKey] as string) ?? "";
                      const selected = form.answer === letter;
                      return (
                        <button
                          key={letter}
                          type="button"
                          onClick={() => setField("answer", letter)}
                          title={choiceText || `Choice ${letter}`}
                          className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border text-base font-bold transition-all ${
                            selected
                              ? "bg-amber-500 border-amber-400 text-white"
                              : "bg-slate-50 border-slate-200 text-slate-400 hover:border-amber-300 hover:text-slate-700"
                          }`}
                        >
                          <span>{letter}</span>
                          {choiceText && (
                            <span className={`text-sm font-normal leading-tight text-center line-clamp-2 ${selected ? "text-amber-100" : "text-slate-400"}`}>
                              {choiceText}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <Input
                    value={form.answer ?? ""}
                    onChange={v => setField("answer", v)}
                    placeholder="e.g. 42, 3/4, or 0.75"
                    mono
                  />
                )}
              </div>

              {/* Media */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <Label>Media (optional)</Label>
                  <button
                    type="button"
                    onClick={addMediaItem}
                    className="text-sm text-amber-500 hover:text-amber-600 font-medium transition-colors"
                  >
                    + Add media
                  </button>
                </div>
                {mediaItems.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">No media attached.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {mediaItems.map((item, idx) => (
                      <div key={idx} className="border border-slate-200 rounded-xl p-3.5 flex flex-col gap-3 bg-slate-50">
                        {/* ID + type row */}
                        <div className="flex gap-2 items-end">
                          <div className="flex-1 flex flex-col gap-1">
                            <span className="text-sm font-bold uppercase tracking-widest text-slate-500">Media ID</span>
                            <input
                              type="text"
                              value={item.mediaId}
                              onChange={e => updateMediaItem(idx, { mediaId: e.target.value })}
                              title="Media ID"
                              placeholder={`${form.uid ?? "UID"}_${String.fromCharCode(65 + idx)}`}
                              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-mono text-slate-700 placeholder-slate-400 focus:outline-none focus:border-amber-500/60 transition-colors"
                            />
                          </div>
                          <div className="flex flex-col gap-1 w-36 shrink-0">
                            <span className="text-sm font-bold uppercase tracking-widest text-slate-500">Type</span>
                            <select
                              value={item.media_type}
                              onChange={e => updateMediaItem(idx, { media_type: e.target.value as MediaType })}
                              title="Media type"
                              className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:border-amber-500/60 transition-colors"
                            >
                              {(Object.keys(MEDIA_TYPE_LABELS) as MediaType[]).map(t => (
                                <option key={t} value={t}>{MEDIA_TYPE_LABELS[t]}</option>
                              ))}
                            </select>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeMediaItem(idx)}
                            className="mb-0.5 w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors text-sm shrink-0"
                          >
                            ✕
                          </button>
                        </div>
                        {/* Content */}
                        {isImageType(item.media_type) ? (
                          <div className="flex flex-col gap-2">
                            {item.previewUrl && (
                              <img src={item.previewUrl} alt="preview" className="max-h-36 object-contain rounded-lg border border-slate-200 bg-slate-50 p-1" />
                            )}
                            {item.isExisting && !item.file && (
                              <p className="text-sm text-slate-400">Existing image — upload a new file below to replace it.</p>
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              title="Upload image"
                              placeholder="Upload image"
                              onChange={e => handleImageFile(idx, e.target.files?.[0])}
                              className="text-sm text-slate-500 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                            />
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {item.isExisting && !item.passageText && (
                              <p className="text-sm text-slate-400 mb-1">Existing passage — edit or replace text below.</p>
                            )}
                            <textarea
                              value={item.passageText}
                              onChange={e => updateMediaItem(idx, { passageText: e.target.value, isExisting: false })}
                              placeholder="Paste or type the full passage text…"
                              rows={5}
                              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-amber-500/60 transition-colors resize-y"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Info note */}
              <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                Saves to <span className="text-slate-700 font-mono">all_questions</span> and topic table{" "}
                <span className="text-amber-600 font-mono">{form.sub_category || "<sub_category>"}</span>.
              </p>

              {saveError && (
                <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</p>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between shrink-0">
              <button type="button" onClick={() => setModalMode(null)}
                className="px-4 py-2 rounded-lg text-base text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                Cancel
              </button>
              <button type="button" onClick={save} disabled={saving}
                className="px-6 py-2 rounded-lg text-base font-bold bg-amber-500 hover:bg-amber-400 text-white transition-colors disabled:opacity-50">
                {saving ? "Saving…" : modalMode === "add" ? "Add Question" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
