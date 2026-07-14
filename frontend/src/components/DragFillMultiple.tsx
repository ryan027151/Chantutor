import { useState, useMemo, useEffect } from "react";
import { parseFormattedText } from "../utils/textParser";

const LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

interface Segment {
  type: "text" | "blank";
  content?: string;
  blankIndex?: number; // 0-based index into placements[]
}

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /\[BLANK_(\d+)\]/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx)
      segments.push({ type: "text", content: text.slice(lastIdx, match.index) });
    segments.push({ type: "blank", blankIndex: parseInt(match[1]) - 1 });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length)
    segments.push({ type: "text", content: text.slice(lastIdx) });
  return segments;
}

function lettersFromAnswer(ans: string, count: number): (string | null)[] {
  if (!ans?.trim()) return Array<null>(count).fill(null);
  const parts = ans.split(",").map(p => p.trim().toUpperCase());
  const result: (string | null)[] = Array<null>(count).fill(null);
  for (let i = 0; i < count && i < parts.length; i++)
    result[i] = LETTERS.includes(parts[i] as (typeof LETTERS)[number]) ? parts[i] : null;
  return result;
}

interface Props {
  text: string;             // sentence(s) with [BLANK_1], [BLANK_2], … markers
  options: string[];        // draggable word tiles A, B, C, D (…up to F), can include distractors
  chosenAnswer: (answer: string) => void; // emits "A,C,B" when all blanks filled, "" otherwise
  isReadOnly?: boolean;
  previousAnswer?: string; // "A,C,B"
  answer?: string;         // correct "A,C,B" (review mode)
}

export default function DragFillMultiple({
  text,
  options,
  chosenAnswer,
  isReadOnly = false,
  previousAnswer = "",
  answer = "",
}: Props) {
  const segments   = useMemo(() => parseSegments(text), [text]);
  const blankCount = useMemo(() => segments.filter(s => s.type === "blank").length, [segments]);
  const tokens     = options.filter(Boolean);

  const [placements, setPlacements] = useState<(string | null)[]>(() =>
    lettersFromAnswer(isReadOnly ? "" : previousAnswer, blankCount)
  );
  const [selected, setSelected]     = useState<string | null>(null);
  const [dragOverBlank, setDragOverBlank] = useState<number | null>(null);

  // Emit initial answer in live mode if previousAnswer provided
  useEffect(() => {
    if (!isReadOnly && previousAnswer?.trim()) {
      const init = lettersFromAnswer(previousAnswer, blankCount);
      if (init.every(p => p !== null))
        chosenAnswer(init.join(","));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function emit(p: (string | null)[]) {
    chosenAnswer(p.every(x => x !== null) ? (p as string[]).join(",") : "");
  }

  // ── Interaction handlers ─────────────────────────────────────────────────────

  function handleTokenClick(letter: string) {
    if (isReadOnly) return;
    // If this token is in some blank, un-place it
    const existingBlank = placements.indexOf(letter);
    if (existingBlank >= 0) {
      const next = [...placements];
      next[existingBlank] = null;
      setPlacements(next);
      setSelected(null);
      emit(next);
      return;
    }
    setSelected(prev => prev === letter ? null : letter);
  }

  function handleBlankClick(bIdx: number) {
    if (isReadOnly) return;
    if (selected) {
      const next = [...placements];
      // If selected was already placed elsewhere, clear that blank
      const prev = next.indexOf(selected);
      if (prev >= 0) next[prev] = null;
      next[bIdx] = selected;
      setPlacements(next);
      setSelected(null);
      emit(next);
    } else if (placements[bIdx]) {
      // Un-place current token
      const next = [...placements];
      next[bIdx] = null;
      setPlacements(next);
      emit(next);
    }
  }

  function handleDrop(e: React.DragEvent, bIdx: number) {
    e.preventDefault();
    setDragOverBlank(null);
    const letter = (e.dataTransfer.getData("text/plain") ?? "").trim().toUpperCase();
    if (!LETTERS.includes(letter as (typeof LETTERS)[number])) return;
    const next = [...placements];
    const prev = next.indexOf(letter);
    if (prev >= 0) next[prev] = null;
    next[bIdx] = letter;
    setPlacements(next);
    setSelected(null);
    emit(next);
  }

  // ── Derived values for review ────────────────────────────────────────────────

  const studentLetters = isReadOnly
    ? lettersFromAnswer(previousAnswer, blankCount)
    : placements;

  const correctLetters = useMemo(
    () => lettersFromAnswer(answer, blankCount),
    [answer, blankCount]
  );

  const anyWrong = isReadOnly &&
    correctLetters.some((cl, i) => cl && studentLetters[i] !== cl);

  const letterToText = (l: string | null) =>
    l ? (tokens[LETTERS.indexOf(l as (typeof LETTERS)[number])] ?? "?") : null;

  const filledCount = placements.filter(Boolean).length;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Text with inline blank slots ───────────────────────────────────── */}
      <div className="text-sm sm:text-base text-slate-800 leading-[2.6rem]">
        {segments.map((seg, si) => {
          if (seg.type === "text")
            return <span key={si}>{parseFormattedText(seg.content!, `dfm-${si}`)}</span>;

          const bIdx = seg.blankIndex!;
          const currentLetter  = isReadOnly ? studentLetters[bIdx] : placements[bIdx];
          const currentText    = letterToText(currentLetter);
          const isDragOver     = dragOverBlank === bIdx;

          const isFilledCorrect = isReadOnly && currentLetter && correctLetters[bIdx]
            ? currentLetter === correctLetters[bIdx] : null;

          let blankCls: string;
          if (isReadOnly) {
            if (!currentLetter)
              blankCls = "border-dashed border-zinc-300 bg-zinc-50 text-zinc-400";
            else if (isFilledCorrect)
              blankCls = "border-emerald-500 bg-emerald-50 text-emerald-800";
            else
              blankCls = "border-rose-500 bg-rose-50 text-rose-800";
          } else if (isDragOver) {
            blankCls = "border-amber-400 bg-amber-50 scale-105";
          } else if (currentLetter) {
            blankCls = "border-zinc-300 bg-white text-zinc-900 shadow-sm";
          } else if (selected) {
            blankCls = "border-amber-400 bg-amber-50/60 border-dashed animate-pulse";
          } else {
            blankCls = "border-dashed border-zinc-300 bg-zinc-50";
          }

          return (
            <span
              key={si}
              role={isReadOnly ? undefined : "button"}
              tabIndex={isReadOnly ? -1 : 0}
              onClick={() => handleBlankClick(bIdx)}
              onKeyDown={e => e.key === "Enter" && handleBlankClick(bIdx)}
              onDragOver={isReadOnly ? undefined : e => { e.preventDefault(); setDragOverBlank(bIdx); }}
              onDragLeave={isReadOnly ? undefined : () => setDragOverBlank(d => d === bIdx ? null : d)}
              onDrop={isReadOnly ? undefined : e => handleDrop(e, bIdx)}
              className={`inline-flex items-center gap-1 mx-1 px-2.5 py-0.5 min-w-[90px] rounded-xl border-2 text-sm font-semibold align-middle transition-all duration-150
                ${!isReadOnly ? "cursor-pointer hover:shadow" : ""}
                ${blankCls}`}
            >
              <span className="text-[10px] font-bold text-zinc-400 shrink-0 leading-none">{bIdx + 1}</span>
              {currentText ? (
                <span>{currentText}</span>
              ) : (
                <span className="text-xs font-normal text-zinc-400">blank</span>
              )}
            </span>
          );
        })}
      </div>

      {/* ── Correct answers panel (read-only, any wrong) ──────────────────── */}
      {isReadOnly && anyWrong && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex flex-col gap-2">
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Correct answers</p>
          <div className="flex flex-wrap gap-2">
            {correctLetters.map((cl, i) => {
              const correctText = letterToText(cl);
              const isRight = studentLetters[i] === cl;
              return (
                <div key={i}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-semibold
                    ${isRight
                      ? "bg-emerald-100 border-emerald-300 text-emerald-700"
                      : "bg-white border-emerald-300 text-emerald-700"}`}
                >
                  <span className="text-zinc-400 font-bold">{i + 1}.</span>
                  <span>{correctText ?? "—"}</span>
                  {isRight && (
                    <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Token bank ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        {!isReadOnly && (
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider select-none">
            {selected
              ? "Click a blank above to place it →"
              : filledCount === blankCount && blankCount > 0
                ? "All blanks filled!"
                : `Word bank · ${filledCount} / ${blankCount} filled`}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {tokens.map((token, i) => {
            const letter   = LETTERS[i];
            const isPlaced = placements.includes(letter);
            const isSelected = selected === letter;

            // Read-only per-token coloring
            let roClass = "";
            if (isReadOnly) {
              const blankForToken = studentLetters.indexOf(letter);
              const isStudentPicked = blankForToken >= 0;
              const isCorrectPicked = correctLetters.includes(letter);
              if (isStudentPicked) {
                const correct = correctLetters[blankForToken] === letter;
                roClass = correct
                  ? "bg-emerald-100 border-emerald-400 text-emerald-800"
                  : "bg-rose-100 border-rose-400 text-rose-800";
              } else if (isCorrectPicked) {
                roClass = "bg-emerald-50 border-emerald-300 text-emerald-600";
              } else {
                roClass = "bg-zinc-50 border-zinc-200 text-zinc-400";
              }
            }

            return (
              <div
                key={letter}
                draggable={!isReadOnly && !isPlaced}
                onDragStart={e => {
                  e.dataTransfer.setData("text/plain", letter);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onClick={() => handleTokenClick(letter)}
                className={`px-4 py-2 rounded-2xl border-2 text-sm font-semibold select-none transition-all duration-150
                  ${isReadOnly
                    ? `${roClass} cursor-default`
                    : isPlaced
                      ? "opacity-30 cursor-pointer bg-zinc-50 border-zinc-200 text-zinc-400"
                      : isSelected
                        ? "bg-amber-400 border-amber-500 text-zinc-900 shadow-lg scale-105 cursor-pointer"
                        : "bg-white border-zinc-300 text-zinc-800 hover:border-amber-400 hover:bg-amber-50 hover:shadow cursor-grab active:cursor-grabbing active:scale-95"
                  }`}
              >
                {token}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
