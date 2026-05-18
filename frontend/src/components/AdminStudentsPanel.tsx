import { useState, useEffect } from "react";
import { supabase } from "../supabase-client";

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
}

interface TestRecord {
  id: string;
  test_name: string;
  created_at: string;
  score: number | null;
  duration: number;
  total_questions: number;
  configuration: Record<string, { count: number }> | null;
}

interface QuestionStat {
  is_correct: boolean | null;
  order_index: number;
}

interface AIAnalysis {
  strengths: string[];
  improvements: string[];
  recommendations: string[];
}

const ANALYSIS_COLORS = {
  strengths: {
    card: "bg-emerald-500/5 border-emerald-500/15",
    title: "text-emerald-400",
    bullet: "text-emerald-500",
    text: "text-emerald-100",
  },
  improvements: {
    card: "bg-amber-500/5 border-amber-500/15",
    title: "text-amber-400",
    bullet: "text-amber-500",
    text: "text-amber-100",
  },
  recommendations: {
    card: "bg-blue-500/5 border-blue-500/15",
    title: "text-blue-400",
    bullet: "text-blue-500",
    text: "text-blue-100",
  },
} as const;

function ScorePill({ score, total }: { score: number | null; total: number }) {
  if (score === null) {
    return (
      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
        In Progress
      </span>
    );
  }
  return (
    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
      Completed
    </span>
  );
}

function formatDuration(min: number) {
  if (min === 0) return "Untimed";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}` : `${m}m`;
}

export default function AdminStudentsPanel() {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<Student | null>(null);
  const [tests, setTests] = useState<TestRecord[]>([]);
  const [loadingTests, setLoadingTests] = useState(false);

  const [expandedTest, setExpandedTest] = useState<string | null>(null);
  const [questionStats, setQuestionStats] = useState<Record<string, QuestionStat[]>>({});
  const [analysis, setAnalysis] = useState<Record<string, AIAnalysis | "loading" | "error">>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, role")
        .in("role", ["student", "parent"])
        .order("first_name");
      setStudents((data as Student[]) ?? []);
      setLoading(false);
    })();
  }, []);

  async function selectStudent(s: Student) {
    setSelected(s);
    setTests([]);
    setExpandedTest(null);
    setQuestionStats({});
    setAnalysis({});
    setLoadingTests(true);
    const { data } = await supabase
      .from("tests")
      .select("id, test_name, created_at, score, duration, total_questions, configuration")
      .eq("user_id", s.id)
      .order("created_at", { ascending: false });
    setTests((data as TestRecord[]) ?? []);
    setLoadingTests(false);
  }

  async function expandTest(test: TestRecord) {
    const isOpen = expandedTest === test.id;
    setExpandedTest(isOpen ? null : test.id);
    if (isOpen || questionStats[test.id]) return;

    const { data } = await supabase
      .from("questions")
      .select("is_correct, order_index")
      .eq("test_id", test.id)
      .eq("user_id", selected!.id);
    setQuestionStats(prev => ({ ...prev, [test.id]: (data as QuestionStat[]) ?? [] }));
  }

  async function runAnalysis(test: TestRecord) {
    setAnalysis(prev => ({ ...prev, [test.id]: "loading" }));
    try {
      const { data, error } = await supabase.functions.invoke("analyze-performance", {
        body: { test_id: test.id, user_id: selected!.id },
      });
      if (error || !data) throw new Error();
      setAnalysis(prev => ({ ...prev, [test.id]: data as AIAnalysis }));
    } catch {
      setAnalysis(prev => ({ ...prev, [test.id]: "error" }));
    }
  }

  const filtered = students.filter(s =>
    `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  const completedTests = tests.filter(t => t.score !== null);
  const avgScore = completedTests.length > 0
    ? Math.round(completedTests.reduce((acc, t) => {
        const stats = questionStats[t.id];
        if (!stats) return acc;
        return acc + (stats.filter(q => q.is_correct).length / t.total_questions) * 100;
      }, 0) / completedTests.length)
    : null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Student list ── */}
      <div className="w-64 shrink-0 flex flex-col border-r border-zinc-800/80 bg-zinc-950">
        <div className="px-4 py-4 border-b border-zinc-800/80">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white">Students</h2>
            <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-medium">{students.length}</span>
          </div>
          <input
            type="search"
            placeholder="Search by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-colors"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="px-4 py-5 text-xs text-zinc-600">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-5 text-xs text-zinc-600">No students found.</p>
          ) : (
            filtered.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => selectStudent(s)}
                className={`w-full text-left px-4 py-3 border-b border-zinc-800/40 transition-colors ${
                  selected?.id === s.id
                    ? "bg-amber-500/8 border-l-2 border-l-amber-500"
                    : "hover:bg-zinc-900/70 border-l-2 border-l-transparent"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-400 shrink-0">
                    {s.first_name[0]}{s.last_name[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-100 truncate">{s.first_name} {s.last_name}</p>
                    <p className="text-xs text-zinc-600 capitalize">{s.role}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Detail panel ── */}
      <div className="flex-1 overflow-y-auto bg-zinc-950">
        {!selected ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center flex flex-col items-center gap-2">
              <svg className="w-10 h-10 text-zinc-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <p className="text-sm text-zinc-600">Select a student to view their profile</p>
            </div>
          </div>
        ) : (
          <div className="p-6 flex flex-col gap-5 max-w-4xl">
            {/* Student header card */}
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-lg font-bold text-amber-400 shrink-0">
                {selected.first_name[0]}{selected.last_name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-white">{selected.first_name} {selected.last_name}</h3>
                <span className="text-xs font-semibold text-amber-500 capitalize">{selected.role}</span>
              </div>
              <div className="flex gap-6 shrink-0">
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{tests.length}</p>
                  <p className="text-xs text-zinc-600">Tests</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-emerald-400">{completedTests.length}</p>
                  <p className="text-xs text-zinc-600">Completed</p>
                </div>
                {avgScore !== null && (
                  <div className="text-center">
                    <p className="text-xl font-bold text-amber-400">{avgScore}%</p>
                    <p className="text-xs text-zinc-600">Avg Score</p>
                  </div>
                )}
              </div>
            </div>

            {/* Test history */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-600 mb-3">Test History</p>
              {loadingTests ? (
                <p className="text-xs text-zinc-700 py-4">Loading tests…</p>
              ) : tests.length === 0 ? (
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 px-5 py-8 text-center text-sm text-zinc-600">
                  No tests taken yet.
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {tests.map(test => {
                    const stats = questionStats[test.id];
                    const correct = stats?.filter(q => q.is_correct === true).length ?? 0;
                    const pct = stats ? Math.round((correct / test.total_questions) * 100) : null;
                    const ai = analysis[test.id];
                    const isExpanded = expandedTest === test.id;

                    return (
                      <div key={test.id} className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
                        {/* Test row header */}
                        <div className="flex items-center gap-4 px-5 py-4">
                          <button
                            type="button"
                            onClick={() => expandTest(test)}
                            className="flex-1 text-left min-w-0"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <svg className={`w-3.5 h-3.5 text-zinc-600 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              <p className="text-sm font-semibold text-zinc-100 truncate">{test.test_name || "Untitled Test"}</p>
                            </div>
                            <p className="text-xs text-zinc-600 mt-0.5 ml-5">
                              {new Date(test.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              {" · "}{test.total_questions} questions{" · "}{formatDuration(test.duration)}
                              {pct !== null && <span className="text-amber-400 font-semibold ml-1.5">{pct}% correct</span>}
                            </p>
                          </button>

                          <ScorePill score={test.score} total={test.total_questions} />

                          {test.score !== null && (
                            <button
                              type="button"
                              onClick={() => runAnalysis(test)}
                              disabled={ai === "loading"}
                              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-amber-500/20 text-amber-400 bg-amber-500/5 hover:bg-amber-500/10 transition-colors disabled:opacity-40 shrink-0"
                            >
                              {ai === "loading" ? "Analyzing…" : typeof ai === "object" ? "Re-analyze" : "AI Analysis"}
                            </button>
                          )}
                        </div>

                        {/* Expanded: question breakdown */}
                        {isExpanded && stats && (
                          <div className="border-t border-zinc-800 px-5 py-4">
                            <p className="text-xs font-bold uppercase tracking-widest text-zinc-600 mb-3">Question Breakdown</p>
                            <div className="flex flex-wrap gap-1.5 mb-4">
                              {Array.from({ length: test.total_questions }, (_, i) => {
                                const q = stats.find(s => s.order_index === i);
                                const englishCount = test.configuration?.english?.count ?? Math.floor(test.total_questions / 2);
                                const isEla = i < englishCount;
                                return (
                                  <div
                                    key={i}
                                    title={`Q${i + 1} · ${isEla ? "ELA" : "Math"} · ${q?.is_correct === true ? "Correct" : q?.is_correct === false ? "Incorrect" : "Skipped"}`}
                                    className={`w-6 h-6 rounded flex items-center justify-center text-xs font-mono font-bold ${
                                      q?.is_correct === true
                                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                        : q?.is_correct === false
                                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                        : "bg-zinc-800 text-zinc-600 border border-zinc-700"
                                    }`}
                                  >
                                    {i + 1}
                                  </div>
                                );
                              })}
                            </div>
                            <div className="flex gap-3 text-xs text-zinc-500">
                              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500/50 inline-block" />{correct} correct</span>
                              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500/50 inline-block" />{stats.filter(q => q.is_correct === false).length} incorrect</span>
                              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-zinc-700 inline-block" />{test.total_questions - stats.length} skipped</span>
                            </div>
                          </div>
                        )}

                        {/* AI Analysis */}
                        {typeof ai === "object" && ai !== null && (
                          <div className="border-t border-zinc-800 px-5 py-4 grid grid-cols-3 gap-3">
                            {(
                              [
                                { key: "strengths" as const, label: "Strengths" },
                                { key: "improvements" as const, label: "Areas to Improve" },
                                { key: "recommendations" as const, label: "Recommendations" },
                              ] as const
                            ).map(({ key, label }) => {
                              const c = ANALYSIS_COLORS[key];
                              return (
                                <div key={key} className={`rounded-lg p-3 border ${c.card}`}>
                                  <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${c.title}`}>{label}</p>
                                  <ul className="flex flex-col gap-1">
                                    {ai[key].map((item, i) => (
                                      <li key={i} className={`text-xs flex gap-1.5 ${c.text}`}>
                                        <span className={`${c.bullet} shrink-0 mt-0.5`}>›</span>
                                        {item}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {ai === "error" && (
                          <div className="border-t border-zinc-800 px-5 py-3 text-xs text-red-400">
                            Analysis failed. Try again.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
