import { useState, useEffect } from "react";
import { parseFormattedText } from "../utils/textParser";

interface Props {
  sentences: string[];
  chosenAnswer: (answer: string) => void; // 1-based index as string: "1", "2", ...
  isReadOnly?: boolean;
  previousAnswer?: string;
  answer?: string; // correct sentence number for review
}

export default function PassageSentenceSelect({
  sentences,
  chosenAnswer,
  isReadOnly = false,
  previousAnswer,
  answer,
}: Props) {
  const [selected, setSelected] = useState<number | null>(() => {
    const n = parseInt(previousAnswer ?? "");
    return isFinite(n) && n >= 1 ? n : null;
  });

  useEffect(() => {
    if (isReadOnly) {
      const n = parseInt(previousAnswer ?? "");
      setSelected(isFinite(n) && n >= 1 ? n : null);
    }
  }, [isReadOnly, previousAnswer]);

  const correctNum = answer ? parseInt(answer) : null;

  function handleClick(num: number) {
    if (isReadOnly) return;
    setSelected(num);
    chosenAnswer(String(num));
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Click on a sentence to select it as your answer.</p>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-1.5">
        {sentences.map((sentence, idx) => {
          const num = idx + 1;
          const isSelected = selected === num;
          const isCorrectSentence = correctNum !== null && num === correctNum;

          let rowCls =
            "flex gap-3 items-start rounded-lg border-2 px-3 py-2.5 transition-all select-none ";

          if (isReadOnly) {
            if (isSelected && isCorrectSentence)
              rowCls += "border-emerald-400 bg-emerald-50 cursor-default";
            else if (isSelected && !isCorrectSentence)
              rowCls += "border-rose-400 bg-rose-50 cursor-default";
            else if (isCorrectSentence)
              rowCls += "border-emerald-400 bg-emerald-50 cursor-default";
            else
              rowCls += "border-transparent cursor-default";
          } else {
            rowCls += isSelected
              ? "border-blue-400 bg-blue-50 cursor-pointer"
              : "border-transparent hover:bg-blue-50/60 hover:border-blue-200 cursor-pointer";
          }

          return (
            <div key={idx} className={rowCls} onClick={() => handleClick(num)}>
              <span className="shrink-0 text-xs text-slate-400 font-mono mt-0.5 w-5 text-right">
                {num}.
              </span>
              <span className="text-sm text-slate-800 leading-relaxed">
                {parseFormattedText(sentence)}
              </span>
            </div>
          );
        })}
      </div>
      {isReadOnly && selected !== null && correctNum !== null && selected !== correctNum && (
        <p className="text-xs text-emerald-700 mt-1">
          Correct answer: Sentence {correctNum}
        </p>
      )}
    </div>
  );
}
