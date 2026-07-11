import { useState } from "react";
import { parseFormattedText } from "../utils/textParser";

interface Props {
  text: string;            // question text containing "[BLANK]" marker
  options: string[];       // ["A) word", "B) word", ...] — up to 4
  chosenAnswer: (answer: string) => void;
  isReadOnly?: boolean;
  previousAnswer?: string; // letter "A"–"D"
  answer?: string;         // correct letter, shown in read-only mode
}

const FALLBACK_LETTERS = ["A", "B", "C", "D"];

function extractLetter(text: string | undefined, fallback: string): string {
  if (!text) return fallback;
  const m = text.match(/^([A-Da-d])[).:\s]/);
  return m ? m[1].toUpperCase() : fallback;
}

function stripPrefix(text: string): string {
  return text.replace(/^[A-Fa-f][).:\s]\s*/, "");
}

export default function InlineDropdownQuestion({
  text,
  options,
  chosenAnswer,
  isReadOnly = false,
  previousAnswer = "",
  answer = "",
}: Props) {
  const [selected, setSelected] = useState(previousAnswer || "");

  const choices = options
    .filter(Boolean)
    .map((opt, i) => ({
      letter: extractLetter(opt, FALLBACK_LETTERS[i]),
      label: stripPrefix(opt),
    }));

  // Split at the [BLANK] marker
  const blankIdx = text.indexOf("[BLANK]");
  const before = blankIdx >= 0 ? text.slice(0, blankIdx) : text;
  const after  = blankIdx >= 0 ? text.slice(blankIdx + 7) : "";

  const correctLetter = answer.trim().toUpperCase();
  const isCorrect  = isReadOnly && selected ? selected === correctLetter : null;
  const correctChoice = choices.find(c => c.letter === correctLetter);

  function handleChange(letter: string) {
    if (isReadOnly) return;
    setSelected(letter);
    chosenAnswer(letter);
  }

  // Dropdown color state
  const dropdownCls = [
    "inline-block mx-1 rounded-lg border-2 px-3 py-1 text-sm font-semibold",
    "focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-amber-400",
    "transition-colors appearance-none cursor-pointer",
    !selected
      ? "border-dashed border-amber-400 bg-amber-50/60 text-slate-400"
      : isCorrect === true
        ? "border-emerald-500 bg-emerald-50 text-emerald-800"
        : isCorrect === false
          ? "border-rose-400 bg-rose-50 text-rose-800"
          : "border-amber-400 bg-amber-50 text-slate-800",
    isReadOnly ? "cursor-default" : "",
  ].join(" ");

  return (
    <div className="flex flex-col gap-3">
      {/* Sentence with embedded dropdown */}
      <p className="text-base leading-relaxed text-slate-800">
        {before && parseFormattedText(before, "b-")}
        <select
          value={selected}
          onChange={e => handleChange(e.target.value)}
          disabled={isReadOnly}
          title="Select an answer"
          className={dropdownCls}
        >
          <option value="">— choose —</option>
          {choices.map(({ letter, label }) => (
            <option key={letter} value={letter}>{label}</option>
          ))}
        </select>
        {after && parseFormattedText(after, "a-")}
      </p>

      {/* Read-only: show correct answer when wrong */}
      {isReadOnly && isCorrect === false && correctChoice && (
        <div className="flex items-center gap-2 text-sm pt-1">
          <span className="text-slate-400 font-medium shrink-0">Correct answer:</span>
          <span className="font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-lg">
            {correctChoice.label}
          </span>
        </div>
      )}

      {/* Read-only: nothing submitted */}
      {isReadOnly && !selected && (
        <p className="text-xs text-slate-400 italic">No answer was submitted.</p>
      )}
    </div>
  );
}
