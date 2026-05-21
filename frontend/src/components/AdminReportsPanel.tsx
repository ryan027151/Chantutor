import { useEffect, useState } from "react";
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
  // joined
  first_name?: string;
  last_name?: string;
}

const REASON_LABEL: Record<string, string> = {
  wrong_answer_key:    "Wrong answer key",
  typo_formatting:     "Typo / formatting",
  unclear_question:    "Unclear question",
  missing_broken_image:"Missing / broken image",
  other:               "Other",
};

const STATUS_STYLE: Record<string, string> = {
  pending:  "bg-amber-50 text-amber-600 border-amber-200",
  reviewed: "bg-blue-50 text-blue-600 border-blue-200",
  resolved: "bg-emerald-50 text-emerald-600 border-emerald-200",
};

export default function AdminReportsPanel() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "reviewed" | "resolved">("all");
  const [updating, setUpdating] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function fetchReports() {
    setLoading(true);
    const { data, error } = await supabase
      .from("question_reports")
      .select("*")
      .order("created_at", { ascending: false });
    if (error || !data) { setLoading(false); return; }

    // Fetch student names in one batch
    const userIds = [...new Set(data.map((r) => r.user_id).filter(Boolean))] as string[];
    let nameMap: Record<string, { first_name: string; last_name: string }> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", userIds);
      for (const p of profiles ?? []) nameMap[p.id] = p;
    }

    setReports(data.map((r) => ({
      ...r,
      first_name: nameMap[r.user_id]?.first_name,
      last_name:  nameMap[r.user_id]?.last_name,
    })));
    setLoading(false);
  }

  async function setStatus(id: string, status: Report["status"]) {
    setUpdating(id);
    await supabase.from("question_reports").update({ status }).eq("id", id);
    setReports((prev) => prev.map((r) => r.id === id ? { ...r, status } : r));
    setUpdating(null);
  }

  useEffect(() => { fetchReports(); }, []);

  const visible = filterStatus === "all" ? reports : reports.filter((r) => r.status === filterStatus);
  const counts = {
    pending:  reports.filter((r) => r.status === "pending").length,
    reviewed: reports.filter((r) => r.status === "reviewed").length,
    resolved: reports.filter((r) => r.status === "resolved").length,
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Question Reports</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            {counts.pending} pending · {counts.reviewed} reviewed · {counts.resolved} resolved
          </p>
        </div>
        <div className="flex gap-1.5">
          {(["all", "pending", "reviewed", "resolved"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors border ${
                filterStatus === s
                  ? "bg-amber-50 text-amber-600 border-amber-200"
                  : "text-slate-500 border-slate-200 hover:text-slate-800 hover:border-slate-300"
              }`}
            >
              {s === "all" ? `All (${reports.length})` : `${s} (${counts[s]})`}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <p className="text-base font-medium text-slate-500">No reports found</p>
            <p className="text-sm text-slate-400">Reports submitted by students will appear here</p>
          </div>
        ) : (
          <table className="w-full text-base border-collapse">
            <thead>
              <tr className="border-b border-slate-200">
                {["Date", "Student", "Test", "Q#", "Reason", "Status", "Actions"].map((h) => (
                  <th key={h} className="text-left text-sm font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((r) => (
                <>
                  <tr
                    key={r.id}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  >
                    <td className="px-5 py-3 text-slate-500 text-sm whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      <br />
                      <span className="text-slate-400">
                        {new Date(r.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-700 font-medium whitespace-nowrap">
                      {r.first_name && r.last_name ? `${r.first_name} ${r.last_name}` : <span className="text-slate-400 font-normal">Unknown</span>}
                    </td>
                    <td className="px-5 py-3 text-slate-600 whitespace-nowrap">
                      {r.test_name ?? <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-5 py-3 text-slate-500 tabular-nums">
                      {r.order_index ?? "—"}
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-block bg-slate-100 text-slate-600 text-sm font-medium px-2 py-0.5 rounded">
                        {REASON_LABEL[r.reason] ?? r.reason}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-block text-sm font-semibold px-2 py-0.5 rounded-full border capitalize ${STATUS_STYLE[r.status]}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {r.status !== "reviewed" && (
                          <button
                            type="button"
                            disabled={updating === r.id}
                            onClick={() => setStatus(r.id, "reviewed")}
                            className="px-2.5 py-1 rounded text-sm font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors disabled:opacity-40"
                          >
                            Review
                          </button>
                        )}
                        {r.status !== "resolved" && (
                          <button
                            type="button"
                            disabled={updating === r.id}
                            onClick={() => setStatus(r.id, "resolved")}
                            className="px-2.5 py-1 rounded text-sm font-medium bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 transition-colors disabled:opacity-40"
                          >
                            Resolve
                          </button>
                        )}
                        {r.status !== "pending" && (
                          <button
                            type="button"
                            disabled={updating === r.id}
                            onClick={() => setStatus(r.id, "pending")}
                            className="px-2.5 py-1 rounded text-sm font-medium bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-200 transition-colors disabled:opacity-40"
                          >
                            Reopen
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expanded detail row */}
                  {expanded === r.id && (
                    <tr key={`${r.id}-detail`} className="bg-slate-50">
                      <td colSpan={7} className="px-5 py-4">
                        <div className="flex flex-col gap-2 text-sm">
                          {r.question_uid && (
                            <div className="flex gap-2">
                              <span className="text-slate-400 w-24 shrink-0">Question UID</span>
                              <span className="text-slate-700 font-mono">{r.question_uid}</span>
                            </div>
                          )}
                          {r.test_id && (
                            <div className="flex gap-2">
                              <span className="text-slate-400 w-24 shrink-0">Test ID</span>
                              <span className="text-slate-500 font-mono">{r.test_id}</span>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <span className="text-slate-400 w-24 shrink-0">Details</span>
                            <span className="text-slate-700 leading-relaxed">
                              {r.description || <span className="text-slate-400 italic">No additional details provided</span>}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
