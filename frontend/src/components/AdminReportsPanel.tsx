import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabase-client";

interface Report {
  id: string;
  created_at: string;
  user_id: string | null;
  test_id: string | null;
  question_uid: string | null;
  order_index: number | null;
  test_name: string | null;
  reason: string;
  description: string | null;
  status: "pending" | "reviewed" | "resolved";
  first_name?: string;
  last_name?: string;
}

interface QuestionPreview {
  uid: string;
  type: string;
  text: string;
  choice_1: string | null;
  choice_2: string | null;
  choice_3: string | null;
  choice_4: string | null;
  answer: string;
  sub_category: string | null;
}

interface Props {
  onEditQuestion: (uid: string, reportId: string) => void;
  onReportResolved: () => void;
}

const REASON_LABEL: Record<string, string> = {
  wrong_answer_key:     "Wrong answer key",
  typo_formatting:      "Typo / formatting",
  unclear_question:     "Unclear question",
  missing_broken_image: "Missing / broken image",
  other:                "Other",
};

const STATUS_STYLE: Record<string, string> = {
  pending:  "bg-amber-500/15 text-amber-500 border-amber-500/30",
  reviewed: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  resolved: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
};

function stripPrefix(s: string) { return s.replace(/^[A-Ha-h][).:\s]\s*/, ""); }
const LETTERS = ["A", "B", "C", "D"];

// ── Question preview card ──────────────────────────────────────────────────────

function QuestionPreviewCard({
  q, onEdit, onDeleteQuestion,
}: {
  q: QuestionPreview;
  onEdit: () => void;
  onDeleteQuestion: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isGraphing = q.type === "linear_graphing";
  const isGridIn   = q.type === "grid-in";
  const choices = (isGraphing || isGridIn)
    ? []
    : [q.choice_1, q.choice_2, q.choice_3, q.choice_4].filter(Boolean) as string[];

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4 flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono font-semibold text-zinc-400 shrink-0">{q.uid}</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
            q.type === "mcq" ? "bg-zinc-100 text-zinc-500"
            : q.type === "grid-in" ? "bg-amber-500/10 text-amber-600"
            : "bg-blue-500/10 text-blue-600"
          }`}>
            {q.type === "mcq" ? "MCQ" : q.type === "grid-in" ? "Grid-in" : "Graphing"}
          </span>
          {q.sub_category && (
            <span className="text-xs text-zinc-400 truncate">{q.sub_category}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-sm font-semibold transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </button>
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 border border-rose-500/20 text-sm font-semibold transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete Question
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-300 bg-rose-50">
              <span className="text-xs font-semibold text-rose-700 mr-1">Permanently delete?</span>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-xs font-semibold text-zinc-500 hover:text-zinc-800 px-2 py-0.5 rounded"
              >Cancel</button>
              <button
                type="button"
                onClick={() => { setConfirmDelete(false); onDeleteQuestion(); }}
                className="text-xs font-semibold text-white bg-rose-500 hover:bg-rose-600 px-2 py-0.5 rounded transition-colors"
              >Delete</button>
            </div>
          )}
        </div>
      </div>

      {/* Question text */}
      <p className="text-sm text-zinc-800 leading-relaxed">{q.text}</p>

      {/* MCQ choices */}
      {choices.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {choices.map((c, i) => {
            const letter = LETTERS[i];
            const isCorrect = q.answer === letter;
            return (
              <div key={letter} className={`flex items-start gap-2 rounded-lg px-3 py-2 border text-sm ${
                isCorrect ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-zinc-50 border-zinc-200 text-zinc-600"
              }`}>
                <span className={`font-bold shrink-0 ${isCorrect ? "text-emerald-600" : "text-zinc-400"}`}>{letter}</span>
                <span className="flex-1">{stripPrefix(c)}</span>
                {isCorrect && (
                  <svg className="w-4 h-4 text-emerald-500 shrink-0 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Grid-in answer */}
      {isGridIn && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-zinc-400 font-medium">Correct answer:</span>
          <span className="font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
            {q.answer}
          </span>
        </div>
      )}

      {/* Graphing answer */}
      {isGraphing && (
        <div className="text-sm text-zinc-400 italic flex items-center gap-2">
          Graph question — correct line:
          <span className="font-mono text-zinc-600 not-italic bg-zinc-100 px-2 py-0.5 rounded">{q.answer}</span>
        </div>
      )}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export default function AdminReportsPanel({ onEditQuestion, onReportResolved }: Props) {
  const [reports, setReports]             = useState<Report[]>([]);
  const [loading, setLoading]             = useState(true);
  const [filterStatus, setFilterStatus]   = useState<"all" | "pending" | "reviewed" | "resolved">("all");
  const [updating, setUpdating]           = useState<string | null>(null);
  const [expanded, setExpanded]           = useState<string | null>(null);
  const [questionCache, setQuestionCache] = useState<Record<string, QuestionPreview | null>>({});
  const [qLoading, setQLoading]           = useState(false);

  // Multi-select
  const [selected, setSelected]           = useState<Set<string>>(new Set());
  const [bulkWorking, setBulkWorking]     = useState(false);

  // Per-row confirm-delete log
  const [confirmDeleteLog, setConfirmDeleteLog] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("question_reports")
      .select("*")
      .order("created_at", { ascending: false });
    if (error || !data) { setLoading(false); return; }

    const userIds = [...new Set(data.map((r) => r.user_id).filter(Boolean))] as string[];
    let nameMap: Record<string, { first_name: string; last_name: string }> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles").select("id, first_name, last_name").in("id", userIds);
      for (const p of profiles ?? []) nameMap[p.id] = p;
    }
    setReports(data.map((r) => ({
      ...r,
      first_name: nameMap[r.user_id]?.first_name,
      last_name:  nameMap[r.user_id]?.last_name,
    })));
    setLoading(false);
  }, []);

  // Fetch question when row expands
  useEffect(() => {
    if (!expanded) return;
    const report = reports.find((r) => r.id === expanded);
    const uid = report?.question_uid;
    if (!uid || uid in questionCache) return;
    setQLoading(true);
    supabase
      .from("all_questions")
      .select("uid, type, text, choice_1, choice_2, choice_3, choice_4, answer, sub_category")
      .eq("uid", uid)
      .single()
      .then(({ data }) => {
        setQuestionCache((prev) => ({ ...prev, [uid]: data as QuestionPreview | null }));
        setQLoading(false);
      });
  }, [expanded, reports, questionCache]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  // ── Status helpers ─────────────────────────────────────────────────────────

  async function setStatus(id: string, status: Report["status"]) {
    const prev = reports.find((r) => r.id === id)?.status;
    setUpdating(id);
    await supabase.from("question_reports").update({ status }).eq("id", id);
    setReports((list) => list.map((r) => r.id === id ? { ...r, status } : r));
    setUpdating(null);
    if (prev === "pending" && status !== "pending") onReportResolved();
  }

  // ── Delete a single report log ─────────────────────────────────────────────

  async function deleteReport(id: string) {
    const wasPending = reports.find((r) => r.id === id)?.status === "pending";
    await supabase.from("question_reports").delete().eq("id", id);
    setReports((list) => list.filter((r) => r.id !== id));
    setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
    if (expanded === id) setExpanded(null);
    if (wasPending) onReportResolved();
  }

  // ── Delete the flagged question from the bank ──────────────────────────────

  async function deleteQuestion(uid: string, reportId: string) {
    // Delete from all_questions
    await supabase.from("all_questions").delete().eq("uid", uid);
    // Best-effort: also remove from topic table if it exists
    const q = questionCache[uid];
    if (q?.sub_category) {
      await supabase.from(q.sub_category).delete().eq("uid", uid).then(() => {});
    }
    // Clear cache and mark report resolved
    setQuestionCache((prev) => {
      const next = { ...prev };
      delete next[uid];
      return next;
    });
    await setStatus(reportId, "resolved");
  }

  // ── Bulk actions ───────────────────────────────────────────────────────────

  async function bulkDeleteReports() {
    setBulkWorking(true);
    const ids = [...selected];
    await supabase.from("question_reports").delete().in("id", ids);
    const deletedPending = reports.filter((r) => ids.includes(r.id) && r.status === "pending").length;
    setReports((list) => list.filter((r) => !ids.includes(r.id)));
    setSelected(new Set());
    for (let i = 0; i < deletedPending; i++) onReportResolved();
    setBulkWorking(false);
  }

  async function bulkSetStatus(status: Report["status"]) {
    setBulkWorking(true);
    const ids = [...selected];
    await supabase.from("question_reports").update({ status }).in("id", ids);
    const prevPendingCount = reports.filter((r) => ids.includes(r.id) && r.status === "pending").length;
    setReports((list) => list.map((r) => ids.includes(r.id) ? { ...r, status } : r));
    setSelected(new Set());
    if (status !== "pending") for (let i = 0; i < prevPendingCount; i++) onReportResolved();
    setBulkWorking(false);
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const visible = filterStatus === "all" ? reports : reports.filter((r) => r.status === filterStatus);
  const counts = {
    pending:  reports.filter((r) => r.status === "pending").length,
    reviewed: reports.filter((r) => r.status === "reviewed").length,
    resolved: reports.filter((r) => r.status === "resolved").length,
  };

  const visibleIds   = visible.map((r) => r.id);
  const allSelected  = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  function toggleAll() {
    if (allSelected) {
      setSelected((s) => { const n = new Set(s); visibleIds.forEach((id) => n.delete(id)); return n; });
    } else {
      setSelected((s) => new Set([...s, ...visibleIds]));
    }
  }

  function toggleOne(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">

      {/* Header */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-zinc-200 flex flex-col gap-2.5 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">Question Reports</h2>
            <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
              {counts.pending} pending · {counts.reviewed} reviewed · {counts.resolved} resolved
            </p>
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "pending", "reviewed", "resolved"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setFilterStatus(s)}
              className={`px-2.5 py-1 rounded-lg text-xs sm:text-sm font-medium capitalize transition-colors border ${
                filterStatus === s
                  ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
                  : "text-zinc-500 border-zinc-200 hover:text-zinc-800 hover:border-zinc-300"
              }`}
            >
              {s === "all" ? `All (${reports.length})` : `${s} (${counts[s as keyof typeof counts]})`}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="px-4 sm:px-5 py-2.5 bg-blue-50 border-b border-blue-100 flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
          <span className="text-sm font-semibold text-blue-700 shrink-0">{selected.size} selected</span>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" disabled={bulkWorking} onClick={() => bulkSetStatus("resolved")}
              className="px-2.5 py-1 rounded-lg text-xs sm:text-sm font-semibold bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 border border-emerald-500/20 disabled:opacity-40 transition-colors whitespace-nowrap">
              Mark Resolved
            </button>
            <button type="button" disabled={bulkWorking} onClick={() => bulkSetStatus("reviewed")}
              className="px-2.5 py-1 rounded-lg text-xs sm:text-sm font-semibold bg-blue-500/10 text-blue-700 hover:bg-blue-500/20 border border-blue-500/20 disabled:opacity-40 transition-colors whitespace-nowrap">
              Mark Reviewed
            </button>
            <button type="button" disabled={bulkWorking} onClick={bulkDeleteReports}
              className="px-2.5 py-1 rounded-lg text-xs sm:text-sm font-semibold bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 border border-rose-500/20 disabled:opacity-40 transition-colors whitespace-nowrap">
              {bulkWorking ? "Deleting…" : `Delete ${selected.size}`}
            </button>
          </div>
          <button type="button" onClick={() => setSelected(new Set())}
            className="ml-auto text-xs sm:text-sm text-zinc-400 hover:text-zinc-700 shrink-0">
            Deselect all
          </button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <p className="text-base font-medium text-zinc-500">No reports found</p>
            <p className="text-sm text-zinc-400">Reports submitted by students will appear here</p>
          </div>
        ) : (
          <table className="w-full text-base border-collapse">
            <thead>
              <tr className="border-b border-zinc-200">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    title="Select all"
                    className="w-4 h-4 rounded border-zinc-300 text-blue-500 cursor-pointer"
                  />
                </th>
                {["Date", "Student", "Test", "Q# / UID", "Reason", "Status", "Actions"].map((h) => (
                  <th key={h} className="text-left text-sm font-semibold text-zinc-400 uppercase tracking-wider px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {visible.map((r) => (
                <React.Fragment key={r.id}>
                  {/* Main row */}
                  <tr
                    className={`transition-colors ${
                      selected.has(r.id) ? "bg-blue-50/60" : expanded === r.id ? "bg-amber-50/60" : "hover:bg-zinc-50"
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                        title="Select report"
                        className="w-4 h-4 rounded border-zinc-300 text-blue-500 cursor-pointer"
                      />
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 text-zinc-500 text-sm whitespace-nowrap cursor-pointer"
                        onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                      {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      <br />
                      <span className="text-zinc-400">
                        {new Date(r.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </span>
                    </td>

                    {/* Student */}
                    <td className="px-4 py-3 text-zinc-700 font-medium whitespace-nowrap cursor-pointer"
                        onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                      {r.first_name && r.last_name
                        ? `${r.first_name} ${r.last_name}`
                        : <span className="text-zinc-400 font-normal">Unknown</span>}
                    </td>

                    {/* Test */}
                    <td className="px-4 py-3 text-zinc-600 whitespace-nowrap max-w-40 truncate cursor-pointer"
                        onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                      {r.test_name ?? <span className="text-zinc-400">—</span>}
                    </td>

                    {/* Q# / UID */}
                    <td className="px-4 py-3 cursor-pointer"
                        onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                      <span className="text-zinc-500 tabular-nums">{r.order_index ?? "—"}</span>
                      {r.question_uid && (
                        <p className="text-xs font-mono text-zinc-400 mt-0.5 max-w-32 truncate" title={r.question_uid}>
                          {r.question_uid}
                        </p>
                      )}
                    </td>

                    {/* Reason */}
                    <td className="px-4 py-3 cursor-pointer"
                        onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                      <span className="inline-block bg-zinc-100 text-zinc-600 text-sm font-medium px-2 py-0.5 rounded">
                        {REASON_LABEL[r.reason] ?? r.reason}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 cursor-pointer"
                        onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                      <span className={`inline-block text-sm font-semibold px-2 py-0.5 rounded-full border capitalize ${STATUS_STYLE[r.status]}`}>
                        {r.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex gap-1 items-center flex-wrap" onClick={(e) => e.stopPropagation()}>
                        {r.status !== "reviewed" && (
                          <button type="button" disabled={updating === r.id} onClick={() => setStatus(r.id, "reviewed")}
                            className="px-2.5 py-1 rounded text-xs font-semibold bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border border-blue-500/20 transition-colors disabled:opacity-40">
                            Review
                          </button>
                        )}
                        {r.status !== "resolved" && (
                          <button type="button" disabled={updating === r.id} onClick={() => setStatus(r.id, "resolved")}
                            className="px-2.5 py-1 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors disabled:opacity-40">
                            Resolve
                          </button>
                        )}
                        {r.status !== "pending" && (
                          <button type="button" disabled={updating === r.id} onClick={() => setStatus(r.id, "pending")}
                            className="px-2.5 py-1 rounded text-xs font-semibold bg-zinc-100 text-zinc-500 hover:bg-zinc-200 border border-zinc-200 transition-colors disabled:opacity-40">
                            Reopen
                          </button>
                        )}
                        {/* Delete log */}
                        {confirmDeleteLog === r.id ? (
                          <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 rounded px-2 py-0.5">
                            <span className="text-xs text-rose-700 font-semibold">Delete log?</span>
                            <button type="button" onClick={() => setConfirmDeleteLog(null)}
                              className="text-xs text-zinc-400 hover:text-zinc-700 px-1">No</button>
                            <button type="button" onClick={() => { setConfirmDeleteLog(null); deleteReport(r.id); }}
                              className="text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 px-1.5 py-0.5 rounded transition-colors">Yes</button>
                          </div>
                        ) : (
                          <button type="button" disabled={updating === r.id} onClick={() => setConfirmDeleteLog(r.id)}
                            className="px-2.5 py-1 rounded text-xs font-semibold bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border border-rose-500/20 transition-colors disabled:opacity-40"
                            title="Delete this report log">
                            Delete log
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expanded detail row */}
                  {expanded === r.id && (
                    <tr key={`${r.id}-detail`} className="bg-amber-50/40">
                      <td colSpan={8} className="px-5 py-4">
                        <div className="flex flex-col gap-4">
                          {r.description && (
                            <div className="flex gap-3">
                              <span className="text-sm font-semibold text-zinc-400 w-24 shrink-0 pt-0.5">Student note</span>
                              <p className="text-sm text-zinc-700 leading-relaxed">{r.description}</p>
                            </div>
                          )}
                          {r.question_uid && (
                            <div className="flex gap-3">
                              <span className="text-sm font-semibold text-zinc-400 w-24 shrink-0 pt-0.5">Question</span>
                              <div className="flex-1 min-w-0">
                                {qLoading && !(r.question_uid in questionCache) ? (
                                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                                    <div className="w-4 h-4 border-2 border-zinc-300 border-t-transparent rounded-full animate-spin" />
                                    Loading question…
                                  </div>
                                ) : questionCache[r.question_uid] ? (
                                  <QuestionPreviewCard
                                    q={questionCache[r.question_uid]!}
                                    onEdit={() => {
                                      onEditQuestion(r.question_uid!, r.id);
                                    }}
                                    onDeleteQuestion={() => deleteQuestion(r.question_uid!, r.id)}
                                  />
                                ) : (
                                  <span className="text-sm text-zinc-400 italic">
                                    <span className="font-mono text-zinc-500 not-italic">{r.question_uid}</span>
                                    {" — question not found (may have been deleted)"}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
