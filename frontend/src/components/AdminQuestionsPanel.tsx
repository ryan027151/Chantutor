import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabase-client";

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
      <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">{children}</span>
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
      className={`w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${mono ? "font-mono" : ""}`}
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
      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/25 transition-colors resize-y"
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
      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/25 transition-colors"
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

  function openAdd() {
    setForm({ ...EMPTY_FORM });
    setOriginalSubCategory(null);
    setIsNewTopic(false);
    setNewTopicName("");
    setSaveError(null);
    setModalMode("add");
  }

  function openEdit(q: Question) {
    setForm({ ...q });
    setOriginalSubCategory(q.sub_category ?? null);
    setIsNewTopic(false);
    setNewTopicName("");
    setSaveError(null);
    setModalMode("edit");
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
      media_refs: form.media_refs || null,
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
    <div className="flex flex-col h-full overflow-hidden bg-zinc-950">
      {/* ── Toolbar ── */}
      <div className="px-6 py-4 border-b border-zinc-800/80 flex items-center gap-3 flex-wrap shrink-0">
        <div className="shrink-0 mr-2">
          <h2 className="text-sm font-bold text-white">Question Bank</h2>
          <p className="text-xs text-zinc-600">{total} questions</p>
        </div>

        <input
          type="search"
          placeholder="Search by UID or question text…"
          value={searchInput}
          onChange={e => handleSearchChange(e.target.value)}
          className="flex-1 min-w-44 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500/40 transition-colors"
        />

        <select title="Filter by subject" value={filterSubject} onChange={e => { setFilterSubject(e.target.value); setPage(0); }}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-amber-500/40 transition-colors">
          <option value="">All Subjects</option>
          <option value="english">ELA</option>
          <option value="math">Math</option>
        </select>

        <select title="Filter by type" value={filterType} onChange={e => { setFilterType(e.target.value); setPage(0); }}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-amber-500/40 transition-colors">
          <option value="">All Types</option>
          <option value="mcq">MCQ</option>
          <option value="grid-in">Grid-in</option>
        </select>

        <select title="Filter by topic" value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(0); }}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-amber-500/40 transition-colors">
          <option value="">All Topics</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <button type="button" onClick={openAdd}
          className="ml-auto shrink-0 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm px-4 py-2 rounded-lg transition-colors">
          + Add Question
        </button>
      </div>

      {fetchError && (
        <div className="mx-5 mt-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 shrink-0">{fetchError}</div>
      )}

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-zinc-950">
            <tr className="border-b border-zinc-800">
              <th className="px-4 py-3 text-left text-xs font-bold text-zinc-600 uppercase tracking-widest">UID</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-zinc-600 uppercase tracking-widest">Subject</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-zinc-600 uppercase tracking-widest">Type</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-zinc-600 uppercase tracking-widest">Topic</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-zinc-600 uppercase tracking-widest">Difficulty</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-zinc-600 uppercase tracking-widest w-full">Question</th>
              <th className="px-4 py-3 text-right text-xs font-bold text-zinc-600 uppercase tracking-widest whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-16 text-center text-zinc-700 text-sm">Loading…</td></tr>
            ) : questions.length === 0 ? (
              <tr><td colSpan={7} className="py-16 text-center text-zinc-700 text-sm">No questions match the current filters.</td></tr>
            ) : questions.map(q => (
              <tr key={q.uid} className="border-b border-zinc-800/40 hover:bg-zinc-900/60 transition-colors group">
                <td className="px-4 py-3 font-mono text-xs text-zinc-500 whitespace-nowrap align-top">{q.uid}</td>
                <td className="px-4 py-3 align-top">
                  {q.subject
                    ? <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${q.subject === "english" ? "bg-blue-500/10 text-blue-400" : "bg-violet-500/10 text-violet-400"}`}>
                        {q.subject === "english" ? "ELA" : "Math"}
                      </span>
                    : <span className="text-zinc-700 text-xs">—</span>}
                </td>
                <td className="px-4 py-3 align-top">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${q.type === "mcq" ? "bg-zinc-800 text-zinc-400" : "bg-amber-500/10 text-amber-400"}`}>
                    {q.type === "mcq" ? "MCQ" : "Grid-in"}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-500 whitespace-nowrap align-top">{q.sub_category ?? "—"}</td>
                <td className="px-4 py-3 text-xs text-zinc-600 capitalize align-top">{q.difficulty ?? "—"}</td>
                <td className="px-4 py-3 align-top max-w-lg">
                  <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">{q.text}</p>
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="flex gap-1.5 justify-end">
                    <button type="button" onClick={() => openEdit(q)}
                      className="text-xs font-medium text-zinc-400 hover:text-amber-400 px-3 py-1.5 rounded-md hover:bg-amber-500/8 border border-zinc-800 hover:border-amber-500/25 transition-colors whitespace-nowrap">
                      Edit
                    </button>
                    {deleteTarget?.uid === q.uid ? (
                      <div className="flex gap-1">
                        <button type="button" onClick={confirmDelete} disabled={deleting}
                          className="text-xs font-medium text-white bg-red-600 hover:bg-red-500 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50">
                          {deleting ? "…" : "Confirm"}
                        </button>
                        <button type="button" onClick={() => setDeleteTarget(null)}
                          className="text-xs text-zinc-500 hover:text-zinc-200 px-2 py-1.5 rounded-md hover:bg-zinc-800 transition-colors">
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setDeleteTarget(q)}
                        className="text-xs font-medium text-zinc-400 hover:text-red-400 px-3 py-1.5 rounded-md hover:bg-red-500/8 border border-zinc-800 hover:border-red-500/25 transition-colors">
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
      <div className="px-6 py-3 border-t border-zinc-800/80 flex items-center justify-between shrink-0">
        <span className="text-xs text-zinc-600">
          {total === 0 ? "No results" : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total}`}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="px-3 py-1.5 text-xs rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 disabled:opacity-30 transition-colors">
            ← Prev
          </button>
          <span className="text-xs text-zinc-600 tabular-nums">{page + 1} / {Math.max(1, totalPages)}</span>
          <button type="button" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE_SIZE >= total}
            className="px-3 py-1.5 text-xs rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 disabled:opacity-30 transition-colors">
            Next →
          </button>
        </div>
      </div>

      {/* ── Add / Edit Modal ── */}
      {modalMode && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-bold text-white">
                  {modalMode === "add" ? "Add New Question" : "Edit Question"}
                </h3>
                {modalMode === "edit" && (
                  <p className="text-xs text-zinc-600 font-mono mt-0.5">{form.uid}</p>
                )}
              </div>
              <button type="button" onClick={() => setModalMode(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors text-base">
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
                        className="text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors"
                      >
                        + New topic
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setIsNewTopic(false); setNewTopicName(""); setField("sub_category", ""); }}
                        className="text-xs text-zinc-500 hover:text-zinc-300 font-medium transition-colors"
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
                      <p className="text-xs text-zinc-600">Creates a new Postgres table with this name.</p>
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
                        <span className="text-xs font-bold text-zinc-600 w-5 shrink-0">{String.fromCharCode(65 + i)}</span>
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
                <Input
                  value={form.answer ?? ""}
                  onChange={v => setField("answer", v)}
                  placeholder={form.type === "grid-in" ? "e.g. 42, 3/4, or 0.75" : "e.g. A) sentence 1"}
                  mono
                />
              </div>

              {/* Media refs */}
              <div className="flex flex-col gap-1.5">
                <Label>Media References (optional)</Label>
                <Input
                  value={form.media_refs ?? ""}
                  onChange={v => setField("media_refs", v)}
                  placeholder="e.g. 25A_Q1_A, 25A_Q1_B"
                  mono
                />
              </div>

              {/* Info note */}
              <p className="text-xs text-zinc-600 bg-zinc-800/40 border border-zinc-700/50 rounded-lg px-3 py-2">
                Saves to <span className="text-zinc-400 font-mono">all_questions</span> and topic table{" "}
                <span className="text-amber-400/80 font-mono">{form.sub_category || "<sub_category>"}</span>.
              </p>

              {saveError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{saveError}</p>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-between shrink-0">
              <button type="button" onClick={() => setModalMode(null)}
                className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
                Cancel
              </button>
              <button type="button" onClick={save} disabled={saving}
                className="px-6 py-2 rounded-lg text-sm font-bold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-colors disabled:opacity-50">
                {saving ? "Saving…" : modalMode === "add" ? "Add Question" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
