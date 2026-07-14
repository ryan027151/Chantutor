import { useState, useEffect } from "react";

const LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

function initPlacements(answer: string, itemCount: number): (string | null)[] {
  if (!answer?.trim()) return Array<null>(itemCount).fill(null);
  const parts = answer.split(",").map(p => p.trim().toUpperCase());
  const result: (string | null)[] = Array<null>(itemCount).fill(null);
  for (let i = 0; i < itemCount && i < parts.length; i++) {
    const v = parts[i];
    result[i] = (LETTERS as readonly string[]).includes(v) ? v : v === "-" ? null : null;
  }
  return result;
}

interface Props {
  items: string[];    // word/expression chips
  bins: string[];     // category column headers
  chosenAnswer: (answer: string) => void; // "-,A,B,-,A" — "-" for unplaced distractors
  isReadOnly?: boolean;
  previousAnswer?: string;
  answer?: string;    // correct "-,A,B,-,A" (review mode)
}

export default function DragToCategorize({
  items,
  bins,
  chosenAnswer,
  isReadOnly = false,
  previousAnswer = "",
  answer = "",
}: Props) {
  const [placements, setPlacements] = useState<(string | null)[]>(() =>
    initPlacements(isReadOnly ? "" : previousAnswer, items.length)
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<number | null>(null);

  useEffect(() => {
    if (!isReadOnly && previousAnswer?.trim()) {
      const init = initPlacements(previousAnswer, items.length);
      emitDirect(init);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function buildAnswer(p: (string | null)[]): string {
    return p.map(v => v ?? "-").join(",");
  }

  function emitDirect(p: (string | null)[]) {
    chosenAnswer(buildAnswer(p));
  }

  function emit(p: (string | null)[]) {
    chosenAnswer(buildAnswer(p));
  }

  // ── Interaction ────────────────────────────────────────────────────────────────

  function handleItemClick(idx: number) {
    if (isReadOnly) return;
    if (placements[idx] !== null) {
      const next = [...placements];
      next[idx] = null;
      setPlacements(next);
      setSelected(null);
      emit(next);
      return;
    }
    setSelected(prev => prev === idx ? null : idx);
  }

  function handleColClick(colIdx: number) {
    if (isReadOnly) return;
    if (selected === null) return;
    const colLetter = LETTERS[colIdx];
    const next = [...placements];
    next[selected] = colLetter;
    setPlacements(next);
    setSelected(null);
    emit(next);
  }

  function handleDrop(e: React.DragEvent, colIdx: number) {
    e.preventDefault();
    setDragOverCol(null);
    const itemIdx = parseInt(e.dataTransfer.getData("text/plain") ?? "", 10);
    if (isNaN(itemIdx) || itemIdx < 0 || itemIdx >= items.length) return;
    const next = [...placements];
    next[itemIdx] = LETTERS[colIdx];
    setPlacements(next);
    setSelected(null);
    emit(next);
  }

  // ── Derived ────────────────────────────────────────────────────────────────────

  const displayPlacements = isReadOnly ? initPlacements(previousAnswer, items.length) : placements;
  const correctPlacements = initPlacements(answer, items.length);

  const unplacedItems   = items.filter((_, i) => displayPlacements[i] === null);
  const placedCount     = displayPlacements.filter(p => p !== null).length;
  const hasSelected     = selected !== null;

  // for each column, get item indices placed there
  function itemsInCol(colIdx: number) {
    const colLetter = LETTERS[colIdx];
    return items
      .map((item, i) => ({ item, idx: i }))
      .filter(({ i: _ = 0, idx }) => displayPlacements[idx] === colLetter);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Item pool ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider select-none">
            {isReadOnly
              ? "Word Pool"
              : selected !== null
                ? `Click a column to place "${items[selected]}" →`
                : `Word Pool${placedCount > 0 ? ` · ${placedCount} / ${items.length} classified` : ""}`}
          </p>
          {!isReadOnly && unplacedItems.length === 0 && (
            <span className="text-xs text-emerald-600 font-semibold">All classified!</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2 min-h-[36px] p-2 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60">
          {items.map((item, idx) => {
            const isPlaced = displayPlacements[idx] !== null;
            const isChosen = selected === idx;
            return (
              <div
                key={idx}
                draggable={!isReadOnly && !isPlaced}
                onDragStart={e => { e.dataTransfer.setData("text/plain", String(idx)); e.dataTransfer.effectAllowed = "move"; }}
                onClick={() => handleItemClick(idx)}
                className={`px-3 py-1 rounded-xl border-2 text-sm font-semibold select-none transition-all duration-150
                  ${isReadOnly
                    ? isPlaced
                      ? displayPlacements[idx] === correctPlacements[idx]
                        ? "bg-emerald-100 border-emerald-400 text-emerald-800 opacity-60 cursor-default"
                        : "bg-rose-100 border-rose-400 text-rose-800 opacity-60 cursor-default"
                      : "bg-zinc-50 border-zinc-200 text-zinc-400 cursor-default"
                    : isPlaced
                      ? "opacity-25 cursor-pointer bg-zinc-50 border-zinc-200 text-zinc-400 text-xs"
                      : isChosen
                        ? "bg-amber-400 border-amber-500 text-zinc-900 shadow-lg scale-105 cursor-pointer"
                        : "bg-white border-zinc-300 text-zinc-800 hover:border-amber-400 hover:bg-amber-50 hover:shadow cursor-grab active:cursor-grabbing active:scale-95"
                  }`}
              >
                {item}
              </div>
            );
          })}
          {!isReadOnly && items.every((_, i) => displayPlacements[i] !== null) && (
            <span className="text-xs text-zinc-300 italic self-center">pool empty — click items in columns to move them back</span>
          )}
        </div>
      </div>

      {/* ── Category table ────────────────────────────────────────────────────── */}
      <div
        className={`grid gap-2`}
        style={{ gridTemplateColumns: `repeat(${bins.length}, minmax(0, 1fr))` }}
      >
        {bins.map((colLabel, colIdx) => {
          const isDragOver = dragOverCol === colIdx;
          const inCol = itemsInCol(colIdx);

          return (
            <div
              key={colIdx}
              onClick={() => handleColClick(colIdx)}
              onDragOver={isReadOnly ? undefined : e => { e.preventDefault(); setDragOverCol(colIdx); }}
              onDragLeave={isReadOnly ? undefined : () => setDragOverCol(d => d === colIdx ? null : d)}
              onDrop={isReadOnly ? undefined : e => handleDrop(e, colIdx)}
              className={`flex flex-col rounded-xl border-2 overflow-hidden transition-all duration-150 min-h-[120px]
                ${!isReadOnly && hasSelected ? "cursor-pointer" : ""}
                ${isDragOver
                  ? "border-amber-400 bg-amber-50 shadow-md scale-[1.01]"
                  : !isReadOnly && hasSelected
                    ? "border-amber-300 bg-amber-50/30 hover:border-amber-400 hover:bg-amber-50"
                    : "border-zinc-200 bg-white"
                }`}
            >
              {/* Column header */}
              <div className={`px-2 py-2 text-center text-xs font-bold border-b leading-tight
                ${isDragOver ? "bg-amber-400 text-zinc-900 border-amber-400" : "bg-zinc-100 text-zinc-600 border-zinc-200"}`}>
                {colLabel}
              </div>

              {/* Placed items */}
              <div className="flex-1 p-2 flex flex-col gap-1.5 min-h-[72px]">
                {inCol.map(({ item, idx }) => {
                  const correctCol  = correctPlacements[idx];
                  const currentCol  = displayPlacements[idx];
                  const isCorrect   = isReadOnly ? currentCol === correctCol : null;
                  return (
                    <div
                      key={idx}
                      onClick={e => { e.stopPropagation(); handleItemClick(idx); }}
                      className={`px-2 py-0.5 rounded-lg border text-xs font-semibold text-center transition-all
                        ${isReadOnly
                          ? isCorrect
                            ? "bg-emerald-100 border-emerald-400 text-emerald-800 cursor-default"
                            : "bg-rose-100 border-rose-400 text-rose-800 cursor-default"
                          : "bg-blue-50 border-blue-200 text-blue-800 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-800 cursor-pointer"
                        }`}
                    >
                      {item}
                    </div>
                  );
                })}
                {inCol.length === 0 && (
                  <span className="text-xs text-zinc-300 italic text-center mt-2 select-none">
                    {!isReadOnly && hasSelected ? "place here" : "—"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Correct answer panel (read-only, if any wrong) ─────────────────── */}
      {isReadOnly && items.some((_, i) =>
        correctPlacements[i] !== null && displayPlacements[i] !== correctPlacements[i]
      ) && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex flex-col gap-2">
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Correct classifications</p>
          <div className="flex flex-wrap gap-2">
            {items.map((item, i) => {
              const cl = correctPlacements[i];
              if (!cl) return null; // distractor — no correct category
              const colName = bins[LETTERS.indexOf(cl as (typeof LETTERS)[number])] ?? cl;
              const isRight = displayPlacements[i] === cl;
              return (
                <div key={i}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border text-xs font-semibold
                    ${isRight ? "bg-emerald-100 border-emerald-300 text-emerald-700" : "bg-white border-emerald-300 text-emerald-700"}`}>
                  <span className="font-bold">{item}</span>
                  <span className="text-zinc-400">→</span>
                  <span>{colName}</span>
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
    </div>
  );
}
