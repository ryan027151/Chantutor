import { useState, useEffect } from "react";
import { parseFormattedText } from "../utils/textParser";

interface Segment {
  type: "text" | "span";
  label?: string;
  content: string;
}

// Parses passage text containing [SPAN_A]...[/SPAN_A], [SPAN_B]...[/SPAN_B], etc.
function parsePassage(passage: string): Segment[] {
  const segments: Segment[] = [];
  const re = /\[SPAN_([A-D])\]([\s\S]*?)\[\/SPAN_\1\]/g;
  let lastIndex = 0;
  let match;
  while ((match = re.exec(passage)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: passage.slice(lastIndex, match.index) });
    }
    segments.push({ type: "span", label: match[1], content: match[2] });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < passage.length) {
    segments.push({ type: "text", content: passage.slice(lastIndex) });
  }
  return segments;
}

interface Props {
  passage: string; // text with [SPAN_A]...[/SPAN_A] markers
  chosenAnswer: (answer: string) => void; // "A" | "B" | "C" | "D"
  isReadOnly?: boolean;
  previousAnswer?: string;
  answer?: string; // correct letter for review
}

export default function InlineTextSpanClick({
  passage,
  chosenAnswer,
  isReadOnly = false,
  previousAnswer,
  answer,
}: Props) {
  const [selected, setSelected] = useState<string | null>(
    () => previousAnswer?.trim().toUpperCase() || null
  );

  useEffect(() => {
    if (isReadOnly) setSelected(previousAnswer?.trim().toUpperCase() || null);
  }, [isReadOnly, previousAnswer]);

  const correctLetter = answer?.trim().toUpperCase() ?? null;
  const segments = parsePassage(passage);

  function handleClick(label: string) {
    if (isReadOnly) return;
    setSelected(label);
    chosenAnswer(label);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Click on an underlined word or phrase to select it.
      </p>
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-[2] text-slate-800">
        {segments.map((seg, i) => {
          if (seg.type === "text") {
            return <span key={i}>{parseFormattedText(seg.content)}</span>;
          }

          const label = seg.label!;
          const isSelected = selected === label;
          const isCorrect = correctLetter === label;

          let spanCls =
            "relative inline underline decoration-2 underline-offset-2 rounded-sm px-0.5 transition-all ";

          if (isReadOnly) {
            if (isSelected && isCorrect)
              spanCls += "bg-emerald-100 decoration-emerald-500 text-emerald-900";
            else if (isSelected && !isCorrect)
              spanCls += "bg-rose-100 decoration-rose-500 text-rose-900";
            else if (isCorrect)
              spanCls += "bg-emerald-100 decoration-emerald-500 text-emerald-900";
            else
              spanCls += "decoration-slate-400 text-slate-600 cursor-default";
          } else {
            spanCls += isSelected
              ? "bg-blue-100 decoration-blue-500 text-blue-900 cursor-pointer"
              : "hover:bg-slate-200 decoration-slate-500 hover:decoration-blue-400 cursor-pointer";
          }

          const labelCls = isReadOnly
            ? isCorrect
              ? "text-emerald-600"
              : isSelected
              ? "text-rose-500"
              : "text-slate-400"
            : isSelected
            ? "text-blue-600"
            : "text-slate-400";

          return (
            <span key={i} className="inline-flex items-baseline gap-px">
              <span className={spanCls} onClick={() => handleClick(label)}>
                {parseFormattedText(seg.content)}
              </span>
              <sup className={`text-[9px] font-bold select-none ${labelCls}`}>{label}</sup>
            </span>
          );
        })}
      </div>

      {isReadOnly && selected && correctLetter && selected !== correctLetter && (
        <p className="text-xs text-emerald-700">Correct answer: Span {correctLetter}</p>
      )}
    </div>
  );
}
