import { useEffect, useState, useContext, useCallback } from "react";
import { supabase } from "../supabase-client";
import { UserContext } from "./userContext";

interface TokenRow {
  id: string;
  token: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
  used_by_email: string | null;
  used_by_profile: { first_name: string; last_name: string } | null;
}

type TokenStatus = "valid" | "used" | "expired";

function getStatus(row: TokenRow): TokenStatus {
  if (row.used_at) return "used";
  if (new Date(row.expires_at) <= new Date()) return "expired";
  return "valid";
}

function relativeTime(iso: string): string {
  const diff = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const abs  = Math.abs(diff);
  const mins = Math.floor(abs / 60);
  const hrs  = Math.floor(abs / 3600);
  if (diff > 0) {
    return mins < 60 ? `expires in ${mins}m` : `expires in ${hrs}h ${mins % 60}m`;
  }
  return mins < 60 ? `expired ${mins}m ago` : `expired ${hrs}h ago`;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

const STATUS_STYLE: Record<TokenStatus, string> = {
  valid:   "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  used:    "bg-blue-500/15 text-blue-500 border-blue-500/30",
  expired: "bg-zinc-100 text-zinc-400 border-zinc-200",
};

const STATUS_LABEL: Record<TokenStatus, string> = {
  valid:   "Valid",
  used:    "Used",
  expired: "Expired",
};

// Chars with no ambiguous lookalikes (removes 0/O, 1/I, S/5)
const TOKEN_CHARS = "ABCDEFGHJKLMNPQRTUVWXYZ2346789";

function makeToken(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const raw = Array.from(bytes).map(b => TOKEN_CHARS[b % TOKEN_CHARS.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export default function AdminTokensPanel() {
  const user = useContext(UserContext);

  const [tokens, setTokens]           = useState<TokenRow[]>([]);
  const [loading, setLoading]          = useState(true);
  const [generating, setGenerating]    = useState(false);
  const [copiedId, setCopiedId]        = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [filter, setFilter]            = useState<"all" | TokenStatus>("all");
  const [, setTick]                    = useState(0); // forces re-render for countdowns

  // ── Fetch tokens ─────────────────────────────────────────────────────────
  const fetchTokens = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("signup_tokens")
      .select("*, used_by_profile:profiles!used_by(first_name, last_name)")
      .order("created_at", { ascending: false });
    if (!error && data) setTokens(data as TokenRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTokens(); }, [fetchTokens]);

  // Live countdown — re-render every 30 s
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Generate token ────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (!user) return;
    setGenerating(true);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Find a token that doesn't collide with any token from the last 30 days
    let token = makeToken();
    for (let attempt = 0; attempt < 20; attempt++) {
      const { count } = await supabase
        .from("signup_tokens")
        .select("id", { count: "exact", head: true })
        .eq("token", token)
        .gte("created_at", thirtyDaysAgo);
      if ((count ?? 0) === 0) break;
      token = makeToken();
    }

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("signup_tokens")
      .insert({ token, expires_at: expiresAt, created_by: user.id })
      .select("*, used_by_profile:profiles!used_by(first_name, last_name)")
      .single();
    if (!error && data) {
      setTokens(prev => [data as TokenRow, ...prev]);
    }
    setGenerating(false);
  }

  // ── Copy to clipboard ─────────────────────────────────────────────────────
  async function copyToken(id: string, token: string) {
    await navigator.clipboard.writeText(token);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // ── Deactivate token ──────────────────────────────────────────────────────
  async function handleDeactivate(id: string) {
    if (!confirm("Deactivate this token? It cannot be re-activated.")) return;
    setDeactivatingId(id);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("signup_tokens")
      .update({ expires_at: now })
      .eq("id", id)
      .is("used_at", null);
    if (!error) {
      setTokens(prev => prev.map(t => t.id === id ? { ...t, expires_at: now } : t));
    }
    setDeactivatingId(null);
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const counts = {
    valid:   tokens.filter(t => getStatus(t) === "valid").length,
    used:    tokens.filter(t => getStatus(t) === "used").length,
    expired: tokens.filter(t => getStatus(t) === "expired").length,
  };

  const visible = filter === "all" ? tokens : tokens.filter(t => getStatus(t) === filter);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">

      {/* ── Header ── */}
      <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-lg font-bold text-zinc-900">Signup Tokens</h2>
          <p className="text-sm text-zinc-400 mt-0.5">
            {counts.valid} valid · {counts.used} used · {counts.expired} expired
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Filter tabs */}
          <div className="flex gap-1.5">
            {(["all", "valid", "used", "expired"] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors border ${
                  filter === s
                    ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
                    : "text-zinc-500 border-zinc-200 hover:text-zinc-800 hover:border-zinc-300"
                }`}
              >
                {s === "all" ? `All (${tokens.length})` : `${STATUS_LABEL[s]} (${counts[s]})`}
              </button>
            ))}
          </div>
          {/* Generate button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-colors disabled:opacity-50"
          >
            {generating ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            )}
            {generating ? "Generating…" : "Generate Token"}
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <p className="text-base font-medium text-zinc-500">No tokens found</p>
            <p className="text-sm text-zinc-400">
              {filter === "all"
                ? `Hit "Generate Token" to create the first one`
                : `No ${STATUS_LABEL[filter as TokenStatus].toLowerCase()} tokens`}
            </p>
          </div>
        ) : (
          <table className="w-full text-base border-collapse">
            <thead>
              <tr className="border-b border-zinc-200">
                {["Token", "Generated", "Expires", "Status", "Used By"].map(h => (
                  <th key={h} className="text-left text-sm font-semibold text-zinc-400 uppercase tracking-wider px-5 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {visible.map(row => {
                const status  = getStatus(row);
                const profile = row.used_by_profile;
                const usedBy  = profile
                  ? `${profile.first_name} ${profile.last_name}`
                  : null;

                return (
                  <tr key={row.id} className="hover:bg-zinc-50 transition-colors">

                    {/* Token */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-zinc-900 tracking-widest text-base">
                          {row.token}
                        </span>
                        {status === "valid" && (
                          <>
                            <button
                              type="button"
                              onClick={() => copyToken(row.id, row.token)}
                              title="Copy to clipboard"
                              className="text-zinc-400 hover:text-zinc-700 transition-colors"
                            >
                              {copiedId === row.id ? (
                                <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeactivate(row.id)}
                              disabled={deactivatingId === row.id}
                              title="Deactivate token"
                              className="text-zinc-400 hover:text-red-500 transition-colors disabled:opacity-40"
                            >
                              {deactivatingId === row.id ? (
                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                </svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </td>

                    {/* Generated */}
                    <td className="px-5 py-3 text-sm text-zinc-500 whitespace-nowrap">
                      {fmt(row.created_at)}
                    </td>

                    {/* Expires */}
                    <td className="px-5 py-3 text-sm whitespace-nowrap">
                      {status === "valid" ? (
                        <span className="text-emerald-600 font-medium">{relativeTime(row.expires_at)}</span>
                      ) : status === "expired" ? (
                        <span className="text-zinc-400">{relativeTime(row.expires_at)}</span>
                      ) : (
                        <span className="text-zinc-400">{fmt(row.expires_at)}</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3">
                      <span className={`inline-block text-sm font-semibold px-2.5 py-0.5 rounded-full border ${STATUS_STYLE[status]}`}>
                        {STATUS_LABEL[status]}
                      </span>
                    </td>

                    {/* Used By */}
                    <td className="px-5 py-3">
                      {status === "used" && (usedBy || row.used_by_email) ? (
                        <div className="flex flex-col gap-0.5">
                          {usedBy && (
                            <span className="text-sm font-semibold text-zinc-700">{usedBy}</span>
                          )}
                          {row.used_by_email && (
                            <span className="text-xs text-zinc-400">{row.used_by_email}</span>
                          )}
                          {row.used_at && (
                            <span className="text-xs text-zinc-300">{fmt(row.used_at)}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-zinc-300 text-sm">—</span>
                      )}
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
