import { useState } from "react";
import { parseFormattedText } from "../utils/textParser";

function extractLetter(text: string | undefined, fallback: string): string {
  if (!text) return fallback;
  const m = text.match(/^([A-Ha-h])[).:\s]/);
  return m ? m[1].toUpperCase() : fallback;
}

function stripChoicePrefix(text: string): string {
  return text.replace(/^[A-Ha-h][).:\s]\s*/, "");
}

interface MCQuestionProps {
  option1: string;
  option2: string;
  option3: string;
  option4: string;
  chosenAnswer: (answer: string) => void;
  isReadOnly?: boolean;
  previousAnswer?: string;
  choiceImages?: Record<string, string>;
  eliminateMode?: boolean;
  eliminatedChoices?: Set<string>;
  onEliminate?: (letter: string) => void;
}

function MCQuestion({
  option1, option2, option3, option4,
  chosenAnswer,
  isReadOnly = false,
  previousAnswer = "",
  choiceImages = {},
  eliminateMode = false,
  eliminatedChoices = new Set(),
  onEliminate,
}: MCQuestionProps) {
  const [selected, setSelected] = useState(previousAnswer || "");

  const rawOptions = [option1, option2, option3, option4];
  // Fallback letters if a choice has no letter prefix stored in the DB.
  // Questions that use ABCD will have "A) …" prefixes; questions that use EFGH
  // will have "E) …" prefixes. extractLetter reads whichever is present, so the
  // bubble naturally shows the correct set for each question.
  const fallbackLetters = ["A", "B", "C", "D"];

  const choices = rawOptions.map((opt, i) => {
    const letter = extractLetter(opt, fallbackLetters[i]); // reads DB letter (A–D or E–H)
    return {
      value: letter,          // backend answer key — original DB letter
      label: opt,
      image: choiceImages[letter] ?? choiceImages[fallbackLetters[i]],
      letter,                 // bubble display — same original DB letter
    };
  });

  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="sr-only">Answer choices</legend>
      {choices.map((choice) => {
        const isSelected = selected === choice.value;
        const isEliminated = eliminatedChoices.has(choice.value);
        return (
          <label
            key={choice.value}
            className={`relative flex items-start gap-3 border rounded-xl p-3.5 transition-colors ${
              isReadOnly
                ? "cursor-default"
                : eliminateMode
                ? "cursor-pointer"
                : "cursor-pointer hover:border-blue-300 hover:bg-blue-50/50"
            } ${isSelected && !eliminateMode ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"} ${
              isEliminated ? "opacity-50" : ""
            }`}
            onClick={e => {
              if (isReadOnly) return;
              if (eliminateMode) {
                e.preventDefault();
                onEliminate?.(choice.value);
                return;
              }
            }}
          >
            <input
              type="radio"
              name="options"
              value={choice.value}
              disabled={isReadOnly || eliminateMode}
              className="sr-only"
              onChange={(e) => {
                if (isReadOnly || eliminateMode) return;
                setSelected(e.target.value);
                chosenAnswer(e.target.value);
              }}
            />
            {/* Letter bubble — shows X when eliminated */}
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border transition-colors mt-0.5 ${
                isEliminated
                  ? "bg-rose-100 border-rose-400 text-rose-500"
                  : isSelected
                  ? "bg-blue-600 text-white border-blue-600"
                  : "border-slate-300 text-slate-500"
              }`}
            >
              {isEliminated ? "✕" : choice.letter}
            </span>
            <div className="flex-1 pt-0.5">
              {choice.image ? (
                <img src={choice.image} alt={`Choice ${choice.letter}`} className={`max-h-16 h-auto ${isEliminated ? "line-through" : ""}`} />
              ) : (
                <span className={`text-sm leading-relaxed ${
                  isEliminated
                    ? "line-through text-slate-400"
                    : isSelected ? "text-blue-900" : "text-slate-700"
                }`}>
                  {parseFormattedText(stripChoicePrefix(choice.label ?? ""))}
                </span>
              )}
            </div>
            {/* Eliminate mode hint */}
            {eliminateMode && !isReadOnly && (
              <span className="shrink-0 mt-0.5 text-[10px] font-semibold text-rose-400 uppercase tracking-widest">
                {isEliminated ? "undo" : "✕"}
              </span>
            )}
          </label>
        );
      })}
    </fieldset>
  );
}

export default MCQuestion;
