import { useState } from "react";
import { parseFormattedText } from "../utils/textParser";

interface MCQuestionProps {
  option1: string;
  option2: string;
  option3: string;
  option4: string;
  chosenAnswer: (answer: string) => void;
  isReadOnly?: boolean;
  previousAnswer?: string;
  choiceImages?: Record<string, string>;
}

function MCQuestion({
  option1, option2, option3, option4,
  chosenAnswer,
  isReadOnly = false,
  previousAnswer = "",
  choiceImages = {},
}: MCQuestionProps) {
  const [selected, setSelected] = useState(isReadOnly ? previousAnswer : "");
  const hasImages = Object.keys(choiceImages).length > 0;

  const choices = [
    { value: hasImages ? "A" : option1, label: option1, image: choiceImages["A"], letter: "A" },
    { value: hasImages ? "B" : option2, label: option2, image: choiceImages["B"], letter: "B" },
    { value: hasImages ? "C" : option3, label: option3, image: choiceImages["C"], letter: "C" },
    { value: hasImages ? "D" : option4, label: option4, image: choiceImages["D"], letter: "D" },
  ];

  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="sr-only">Answer choices</legend>
      {choices.map((choice) => {
        const isSelected = selected === choice.value;
        return (
          <label
            key={choice.value}
            className={`flex items-start gap-3 border rounded-xl p-3.5 transition-colors ${
              isReadOnly
                ? "cursor-default"
                : "cursor-pointer hover:border-blue-300 hover:bg-blue-50/50"
            } ${isSelected ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"}`}
          >
            <input
              type="radio"
              name="options"
              value={choice.value}
              disabled={isReadOnly}
              className="sr-only"
              onChange={(e) => {
                if (isReadOnly) return;
                setSelected(e.target.value);
                chosenAnswer(e.target.value);
              }}
            />
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border transition-colors mt-0.5 ${
                isSelected
                  ? "bg-blue-600 text-white border-blue-600"
                  : "border-slate-300 text-slate-500"
              }`}
            >
              {choice.letter}
            </span>
            <div className="flex-1 pt-0.5">
              {choice.image ? (
                <img src={choice.image} alt={`Choice ${choice.letter}`} className="max-h-16 h-auto" />
              ) : (
                <span className={`text-sm leading-relaxed ${isSelected ? "text-blue-900" : "text-slate-700"}`}>
                  {parseFormattedText(choice.label ?? "")}
                </span>
              )}
            </div>
          </label>
        );
      })}
    </fieldset>
  );
}

export default MCQuestion;
