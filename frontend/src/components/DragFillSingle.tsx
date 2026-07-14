import { useState, useEffect } from "react";
import { parseFormattedText } from "../utils/textParser";

const LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

interface Props {
  text: string;             // sentence with [BLANK] marker
  options: string[];        // draggable word tiles A, B, C, D (…up to F)
  chosenAnswer: (letter: string) => void;
  isReadOnly?: boolean;
  previousAnswer?: string; // letter "A"/"B"/…
  answer?: string;         // correct letter (review mode only)
}

export default function DragFillSingle({
  text,
  options,
  chosenAnswer,
  isReadOnly = false,
  previousAnswer = "",
  answer = "",
}: Props) {
  const init = previousAnswer?.trim().toUpperCase() || null;
  const [placed, setPlaced] = useState<string | null>(isReadOnly ? null : init);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Emit initial answer once on mount in live mode
  useEffect(() => {
    if (!isReadOnly && init) chosenAnswer(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const blankIdx = text.indexOf("[BLANK]");
  const before = blankIdx >= 0 ? text.slice(0, blankIdx) : text;
  const after  = blankIdx >= 0 ? text.slice(blankIdx + 7) : "";
  const tokens = options.filter(Boolean);

  // ── Interaction handlers ─────────────────────────────────────────────────────

  function place(letter: string) {
    setPlaced(letter);
    setSelected(null);
    chosenAnswer(letter);
  }

  function unplace() {
    setPlaced(null);
    setSelected(null);
    chosenAnswer("");
  }

  function handleTokenClick(letter: string) {
    if (isReadOnly) return;
    if (placed === letter) { unplace(); return; }
    if (selected === letter) { setSelected(null); return; }
    setSelected(letter);
  }

  function handleBlankClick() {
    if (isReadOnly) return;
    if (selected) { place(selected); return; }
    if (placed)   { unplace(); }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const letter = (e.dataTransfer.getData("text/plain") ?? "").trim().toUpperCase();
    if (LETTERS.includes(letter as (typeof LETTERS)[number])) place(letter);
  }

  // ── Derived display values ───────────────────────────────────────────────────

  const displayLetter  = isReadOnly ? (previousAnswer?.trim().toUpperCase() || null) : placed;
  const correctLetter  = answer?.trim().toUpperCase() || null;
  const reviewCorrect  = isReadOnly && displayLetter && correctLetter
    ? displayLetter === correctLetter : null;

  const letterToText = (l: string | null) =>
    l ? (tokens[LETTERS.indexOf(l as (typeof LETTERS)[number])] ?? "?") : null;

  const displayText = letterToText(displayLetter);
  const correctText = letterToText(correctLetter);

  // ── Blank slot style ─────────────────────────────────────────────────────────

  let blankCls: string;
  if (isReadOnly) {
    if (!displayLetter)
      blankCls = "border-dashed border-zinc-300 bg-zinc-50 text-zinc-400";
    else if (reviewCorrect)
      blankCls = "border-emerald-500 bg-emerald-50 text-emerald-800";
    else
      blankCls = "border-rose-500 bg-rose-50 text-rose-800";
  } else if (dragOver) {
    blankCls = "border-amber-400 bg-amber-50 scale-105";
  } else if (selected && !placed) {
    blankCls = "border-amber-400 bg-amber-50/60 border-dashed animate-pulse";
  } else if (placed) {
    blankCls = "border-zinc-300 bg-white text-zinc-900 shadow-sm";
  } else {
    blankCls = "border-dashed border-zinc-300 bg-zinc-50";
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── Sentence with blank ─────────────────────────────────────────────── */}
      <div className="text-sm sm:text-base text-slate-800 leading-[2.4rem]">
        <span>{parseFormattedText(before, "dfs-b")}</span>

        {/* Blank drop target */}
        <span
          role="button"
          tabIndex={isReadOnly ? -1 : 0}
          onClick={handleBlankClick}
          onKeyDown={e => e.key === "Enter" && handleBlankClick()}
          onDragOver={isReadOnly ? undefined : e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={isReadOnly ? undefined : () => setDragOver(false)}
          onDrop={isReadOnly ? undefined : handleDrop}
          className={`inline-flex items-center justify-center gap-1 mx-1.5 px-3 py-0.5 min-w-[108px] rounded-xl border-2 text-sm font-semibold align-middle transition-all duration-150
            ${!isReadOnly ? "cursor-pointer hover:shadow" : ""}
            ${blankCls}`}
        >
          {displayText ?? (
            <span className="text-xs font-normal text-zinc-400 tracking-wide">drop here</span>
          )}
        </span>

        <span>{parseFormattedText(after, "dfs-a")}</span>
      </div>

      {/* ── Correct answer strip (read-only wrong) ──────────────────────────── */}
      {isReadOnly && reviewCorrect === false && correctText && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-400 font-medium shrink-0">Correct answer:</span>
          <span className="font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl">
            {correctText}
          </span>
        </div>
      )}

      {/* ── Token bank ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        {!isReadOnly && (
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider select-none">
            {selected
              ? "Now click the blank above →"
              : placed
                ? "Answer placed · click the blank or tile to change"
                : "Select a word tile to fill the blank"}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {tokens.map((token, i) => {
            const letter = LETTERS[i];
            const isPlaced    = placed === letter;
            const isSelected  = selected === letter;

            // Read-only coloring
            let roClass = "";
            if (isReadOnly) {
              const isStudentPick = displayLetter === letter;
              const isCorrectPick = correctLetter === letter;
              if (isStudentPick && reviewCorrect)
                roClass = "bg-emerald-100 border-emerald-400 text-emerald-800";
              else if (isStudentPick)
                roClass = "bg-rose-100 border-rose-400 text-rose-800";
              else if (isCorrectPick)
                roClass = "bg-emerald-50 border-emerald-300 text-emerald-600";
              else
                roClass = "bg-zinc-50 border-zinc-200 text-zinc-400";
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
