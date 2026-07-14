import { useState, useEffect } from "react";

const LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

function initPlacements(answer: string, itemCount: number): (string | null)[] {
  if (!answer?.trim()) return Array<null>(itemCount).fill(null);
  const parts = answer.split(",").map(p => p.trim().toUpperCase());
  const result: (string | null)[] = Array<null>(itemCount).fill(null);
  for (let i = 0; i < itemCount && i < parts.length; i++)
    result[i] = LETTERS.includes(parts[i] as (typeof LETTERS)[number]) ? parts[i] : null;
  return result;
}

interface Props {
  items: string[];   // draggable item chips (all must be placed)
  bins: string[];    // bin labels
  chosenAnswer: (answer: string) => void; // "A,B,A,C,B" one bin-letter per item
  isReadOnly?: boolean;
  previousAnswer?: string;
  answer?: string;   // correct "A,B,A,C,B" for review
}

export default function DragToBin({
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
  const [selected, setSelected] = useState<number | null>(null); // item index
  const [dragOverBin, setDragOverBin] = useState<number | null>(null);

  useEffect(() => {
    if (!isReadOnly && previousAnswer?.trim()) {
      const init = initPlacements(previousAnswer, items.length);
      if (init.every(p => p !== null)) chosenAnswer(init.join(","));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function emit(p: (string | null)[]) {
    chosenAnswer(p.every(x => x !== null) ? (p as string[]).join(",") : "");
  }

  // ── Interaction ────────────────────────────────────────────────────────────────

  function handleItemClick(idx: number) {
    if (isReadOnly) return;
    const currentBin = placements[idx];
    if (currentBin !== null) {
      // Un-place: return to pool
      const next = [...placements];
      next[idx] = null;
      setPlacements(next);
      setSelected(null);
      emit(next);
      return;
    }
    setSelected(prev => prev === idx ? null : idx);
  }

  function handleBinClick(binIdx: number) {
    if (isReadOnly) return;
    if (selected === null) return;
    const binLetter = LETTERS[binIdx];
    const next = [...placements];
    next[selected] = binLetter;
    setPlacements(next);
    setSelected(null);
    emit(next);
  }

  function handleDrop(e: React.DragEvent, binIdx: number) {
    e.preventDefault();
    setDragOverBin(null);
    const itemIdx = parseInt(e.dataTransfer.getData("text/plain") ?? "", 10);
    if (isNaN(itemIdx) || itemIdx < 0 || itemIdx >= items.length) return;
    const next = [...placements];
    next[itemIdx] = LETTERS[binIdx];
    setPlacements(next);
    setSelected(null);
    emit(next);
  }

  // ── Derived review data ────────────────────────────────────────────────────────

  const displayPlacements = isReadOnly ? initPlacements(previousAnswer, items.length) : placements;
  const correctPlacements = initPlacements(answer, items.length);

  const placedCount  = placements.filter(p => p !== null).length;
  const totalItems   = items.length;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Item pool ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider select-none">
          {isReadOnly
            ? "Items"
            : selected !== null
              ? `Now click a bin to place "${items[selected]}" →`
              : placedCount === totalItems
                ? "All items placed!"
                : `Items · ${placedCount} / ${totalItems} placed`}
        </p>
        <div className="flex flex-wrap gap-2">
          {items.map((item, idx) => {
            const binLetter       = displayPlacements[idx];
            const isPlaced        = binLetter !== null;
            const isChosen        = selected === idx;
            const correctBin      = correctPlacements[idx];
            const isCorrectPlaced = isReadOnly && isPlaced && binLetter === correctBin;
            const isWrongPlaced   = isReadOnly && isPlaced && binLetter !== correctBin;

            return (
              <div
                key={idx}
                draggable={!isReadOnly && !isPlaced}
                onDragStart={e => { e.dataTransfer.setData("text/plain", String(idx)); e.dataTransfer.effectAllowed = "move"; }}
                onClick={() => handleItemClick(idx)}
                className={`px-3.5 py-1.5 rounded-2xl border-2 text-sm font-semibold select-none transition-all duration-150
                  ${isReadOnly
                    ? isCorrectPlaced
                      ? "bg-emerald-100 border-emerald-400 text-emerald-800 cursor-default"
                      : isWrongPlaced
                        ? "bg-rose-100 border-rose-400 text-rose-800 cursor-default"
                        : "bg-zinc-50 border-zinc-200 text-zinc-400 cursor-default"
                    : isPlaced
                      ? "opacity-30 cursor-pointer bg-zinc-50 border-zinc-200 text-zinc-400"
                      : isChosen
                        ? "bg-amber-400 border-amber-500 text-zinc-900 shadow-lg scale-105 cursor-pointer"
                        : "bg-white border-zinc-300 text-zinc-800 hover:border-amber-400 hover:bg-amber-50 hover:shadow cursor-grab active:cursor-grabbing active:scale-95"
                  }`}
              >
                {item}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Bins ──────────────────────────────────────────────────────────────── */}
      <div className={`grid gap-3 ${bins.length === 2 ? "grid-cols-2" : bins.length === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}>
        {bins.map((binLabel, binIdx) => {
          const binLetter   = LETTERS[binIdx];
          const isDragOver  = dragOverBin === binIdx;
          const itemsInBin  = items.map((item, i) => ({ item, idx: i, placed: displayPlacements[i] === binLetter }))
                                   .filter(x => x.placed);
          const hasSelected = selected !== null;

          return (
            <div
              key={binIdx}
              onClick={() => handleBinClick(binIdx)}
              onDragOver={isReadOnly ? undefined : e => { e.preventDefault(); setDragOverBin(binIdx); }}
              onDragLeave={isReadOnly ? undefined : () => setDragOverBin(d => d === binIdx ? null : d)}
              onDrop={isReadOnly ? undefined : e => handleDrop(e, binIdx)}
              className={`flex flex-col rounded-2xl border-2 overflow-hidden transition-all duration-150 min-h-[100px]
                ${!isReadOnly && hasSelected ? "cursor-pointer" : ""}
                ${isDragOver
                  ? "border-amber-400 bg-amber-50 scale-[1.02] shadow-md"
                  : !isReadOnly && hasSelected
                    ? "border-amber-300 bg-amber-50/40 hover:border-amber-400 hover:bg-amber-50"
                    : "border-zinc-200 bg-zinc-50"
                }`}
            >
              {/* Bin header */}
              <div className={`px-3 py-2 text-center text-xs font-bold uppercase tracking-wider border-b
                ${isDragOver ? "bg-amber-400 text-zinc-900 border-amber-400" : "bg-zinc-100 text-zinc-500 border-zinc-200"}`}>
                {binLabel}
              </div>

              {/* Placed items */}
              <div className="flex-1 p-2 flex flex-wrap gap-1.5 content-start min-h-[64px]">
                {itemsInBin.map(({ item, idx }) => {
                  const correctBin      = correctPlacements[idx];
                  const isCorrect       = isReadOnly ? displayPlacements[idx] === correctBin : null;
                  return (
                    <div
                      key={idx}
                      onClick={e => { e.stopPropagation(); handleItemClick(idx); }}
                      className={`px-2.5 py-1 rounded-xl border text-xs font-semibold transition-all
                        ${isReadOnly
                          ? isCorrect
                            ? "bg-emerald-100 border-emerald-400 text-emerald-800 cursor-default"
                            : "bg-rose-100 border-rose-400 text-rose-800 cursor-default"
                          : "bg-white border-zinc-300 text-zinc-800 hover:border-rose-400 hover:bg-rose-50 cursor-pointer"
                        }`}
                    >
                      {item}
                    </div>
                  );
                })}
                {itemsInBin.length === 0 && (
                  <span className="text-xs text-zinc-300 italic self-center w-full text-center pt-1">
                    {!isReadOnly && hasSelected ? "drop here" : "empty"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Correct answer panel (read-only, if any wrong) ─────────────────── */}
      {isReadOnly && items.some((_, i) => displayPlacements[i] !== correctPlacements[i]) && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex flex-col gap-2">
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Correct assignments</p>
          <div className="flex flex-wrap gap-2">
            {items.map((item, i) => {
              const cl   = correctPlacements[i];
              const binName = cl ? bins[LETTERS.indexOf(cl as (typeof LETTERS)[number])] ?? cl : "?";
              const isRight = displayPlacements[i] === cl;
              return (
                <div key={i}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border text-xs font-semibold
                    ${isRight ? "bg-emerald-100 border-emerald-300 text-emerald-700" : "bg-white border-emerald-300 text-emerald-700"}`}>
                  <span className="font-bold">{item}</span>
                  <span className="text-zinc-400">→</span>
                  <span>{binName}</span>
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
