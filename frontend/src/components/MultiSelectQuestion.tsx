import { useState } from "react";
import { parseFormattedText } from "../utils/textParser";

const FALLBACK_LETTERS = ["A", "B", "C", "D", "E", "F"];

function extractLetter(text: string | undefined, fallback: string): string {
  if (!text) return fallback;
  const m = text.match(/^([A-Fa-f])[).:\s]/);
  return m ? m[1].toUpperCase() : fallback;
}

function stripChoicePrefix(text: string): string {
  return text.replace(/^[A-Fa-f][).:\s]\s*/, "");
}

interface Props {
  options: string[];
  selectCount: number;
  chosenAnswer: (answer: string) => void;
  isReadOnly?: boolean;
  previousAnswer?: string;
  choiceImages?: Record<string, string>;
}

export default function MultiSelectQuestion({
  options,
  selectCount,
  chosenAnswer,
  isReadOnly = false,
  previousAnswer = "",
  choiceImages = {},
}: Props) {
  const initialChecked = new Set<string>(
    isReadOnly
      ? previousAnswer.split(",").map(s => s.trim()).filter(Boolean)
      : []
  );
  const [checked, setChecked] = useState<Set<string>>(initialChecked);

  const choices = options.filter(Boolean).map((opt, i) => ({
    letter: extractLetter(opt, FALLBACK_LETTERS[i]),
    label: opt,
    image: choiceImages[FALLBACK_LETTERS[i]],
  }));

  const use2Col = choices.length > 4;

  function toggle(letter: string) {
    if (isReadOnly) return;
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(letter)) next.delete(letter);
      else next.add(letter);
      chosenAnswer([...next].sort().join(","));
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold text-slate-500">
        Select <strong className="text-slate-700">{selectCount}</strong> correct answer{selectCount !== 1 ? "s" : ""}.
      </p>
      <fieldset
        className={use2Col ? "grid grid-cols-2 gap-2.5" : "flex flex-col gap-2.5"}
      >
        <legend className="sr-only">Answer choices</legend>
        {choices.map(({ letter, label, image }) => {
          const isSelected = checked.has(letter);
          return (
            <label
              key={letter}
              className={`flex items-start gap-3 border rounded-xl p-3.5 transition-colors ${
                isReadOnly
                  ? "cursor-default"
                  : "cursor-pointer hover:border-blue-300 hover:bg-blue-50/50"
              } ${isSelected ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"}`}
            >
              <input
                type="checkbox"
                value={letter}
                checked={isSelected}
                disabled={isReadOnly}
                className="sr-only"
                onChange={() => toggle(letter)}
              />
              <span
                className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold shrink-0 border transition-colors mt-0.5 ${
                  isSelected
                    ? "bg-blue-600 text-white border-blue-600"
                    : "border-slate-300 text-slate-500"
                }`}
              >
                {letter}
              </span>
              <div className="flex-1 pt-0.5">
                {image ? (
                  <img src={image} alt={`Choice ${letter}`} className="max-h-16 h-auto" />
                ) : (
                  <span className={`text-sm leading-relaxed ${isSelected ? "text-blue-900" : "text-slate-700"}`}>
                    {parseFormattedText(stripChoicePrefix(label ?? ""))}
                  </span>
                )}
              </div>
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}
