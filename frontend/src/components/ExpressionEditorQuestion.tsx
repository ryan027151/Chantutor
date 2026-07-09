import { useState, type ReactNode } from "react";

// Renders expression string with ^exp → superscript for display
function ExprDisplay({ value }: { value: string }) {
  if (!value) {
    return <span className="text-slate-400 font-normal text-base">Enter your answer here</span>;
  }
  const nodes: ReactNode[] = [];
  let i = 0;
  while (i < value.length) {
    if (value[i] === "^") {
      let j = i + 1;
      while (j < value.length && /[0-9a-zA-Z.]/.test(value[j])) j++;
      if (j > i + 1) {
        nodes.push(<sup key={`sup-${i}`} className="text-sm">{value.slice(i + 1, j)}</sup>);
        i = j;
        continue;
      }
      nodes.push(<span key={`caret-${i}`}>^</span>);
      i++;
    } else {
      const start = i;
      while (i < value.length && value[i] !== "^") i++;
      nodes.push(<span key={`run-${start}`}>{value.slice(start, i)}</span>);
    }
  }
  return <>{nodes}</>;
}

// 4 rows × 6 cols — matches SHSAT virtual keyboard layout
const KEY_ROWS: { label: string; ins: string }[][] = [
  [
    { label: "7", ins: "7" },
    { label: "8", ins: "8" },
    { label: "9", ins: "9" },
    { label: "÷", ins: "÷" },
    { label: "(", ins: "(" },
    { label: ")", ins: ")" },
  ],
  [
    { label: "4", ins: "4" },
    { label: "5", ins: "5" },
    { label: "6", ins: "6" },
    { label: "×", ins: "×" },
    { label: "≤", ins: "≤" },
    { label: "≥", ins: "≥" },
  ],
  [
    { label: "1", ins: "1" },
    { label: "2", ins: "2" },
    { label: "3", ins: "3" },
    { label: "−", ins: "−" },
    { label: "<", ins: "<" },
    { label: ">", ins: ">" },
  ],
  [
    { label: "0", ins: "0" },
    { label: ".", ins: "." },
    { label: "+", ins: "+" },
    { label: "=", ins: "=" },
    { label: "/", ins: "/" },
    { label: "%", ins: "%" },
  ],
];

// Special function keys (amber-tinted, bottom row)
const SPECIAL_KEYS: { label: string; ins: string; title: string }[] = [
  { label: "√(",  ins: "√(", title: "Square root — close with )" },
  { label: "π",   ins: "π",  title: "Pi" },
  { label: "| |", ins: "|",  title: "Absolute value bar" },
  { label: "□ⁿ", ins: "^",  title: "Exponent — type the power after pressing" },
];

interface Props {
  chosenAnswer: (answer: string) => void;
  isReadOnly?: boolean;
  previousAnswer?: string;
  variables?: string[];
}

export default function ExpressionEditorQuestion({
  chosenAnswer,
  isReadOnly = false,
  previousAnswer = "",
  variables = [],
}: Props) {
  const [expr, setExpr] = useState(previousAnswer);

  function press(ins: string) {
    if (isReadOnly) return;
    setExpr(prev => {
      const next = prev + ins;
      chosenAnswer(next);
      return next;
    });
  }

  function del() {
    if (isReadOnly) return;
    setExpr(prev => {
      const next = prev.slice(0, -1);
      chosenAnswer(next);
      return next;
    });
  }

  function clr() {
    if (isReadOnly) return;
    setExpr("");
    chosenAnswer("");
  }

  return (
    <div className="flex flex-col gap-3 select-none">
      {/* Expression display */}
      <div
        className={`min-h-[3.25rem] rounded-xl border-2 px-4 py-3 font-mono text-lg leading-relaxed flex items-center gap-0.5 ${
          isReadOnly
            ? "bg-slate-50 border-slate-200 text-slate-800"
            : "bg-white border-blue-300 shadow-sm text-slate-900"
        }`}
      >
        <ExprDisplay value={expr} />
        {!isReadOnly && (
          <span className="inline-block w-[2px] h-[1.1em] bg-blue-500 ml-0.5 animate-pulse" />
        )}
      </div>

      {/* Keyboard — hidden in read-only (review) mode */}
      {!isReadOnly && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 flex flex-col gap-1.5">

          {/* Variable buttons — only shown when the question specifies variables */}
          {variables.length > 0 && (
            <div className="flex items-center gap-1 pb-1.5 border-b border-slate-200 flex-wrap">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pr-1">Var</span>
              {variables.map(v => (
                <button
                  key={v}
                  type="button"
                  title={`Insert variable ${v}`}
                  onMouseDown={e => { e.preventDefault(); press(v); }}
                  className="h-9 min-w-[2.25rem] px-2 rounded-lg border border-indigo-200 bg-white text-indigo-700 text-sm font-bold italic hover:bg-indigo-50 hover:border-indigo-400 active:scale-95 transition-all shadow-sm"
                >
                  {v}
                </button>
              ))}
            </div>
          )}

          {/* Main key grid: 4 rows × 6 cols */}
          <div className="flex flex-col gap-1">
            {KEY_ROWS.map((row, ri) => (
              <div key={ri} className="grid grid-cols-6 gap-1">
                {row.map(key => (
                  <button
                    key={key.ins}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); press(key.ins); }}
                    className="h-10 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm font-semibold hover:bg-blue-50 hover:border-blue-300 active:scale-95 active:bg-blue-100 transition-all shadow-sm"
                  >
                    {key.label}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Special functions + backspace + clear */}
          <div className="grid grid-cols-6 gap-1 pt-1 border-t border-slate-200">
            {SPECIAL_KEYS.map(key => (
              <button
                key={key.ins}
                type="button"
                title={key.title}
                onMouseDown={e => { e.preventDefault(); press(key.ins); }}
                className="h-10 rounded-lg border border-amber-200 bg-white text-slate-700 text-sm font-semibold hover:bg-amber-50 hover:border-amber-400 active:scale-95 active:bg-amber-100 transition-all shadow-sm"
              >
                {key.label}
              </button>
            ))}
            <button
              type="button"
              title="Backspace"
              onMouseDown={e => { e.preventDefault(); del(); }}
              className="h-10 rounded-lg border border-slate-200 bg-white text-slate-600 text-lg hover:bg-rose-50 hover:border-rose-300 active:scale-95 transition-all shadow-sm"
            >
              ⌫
            </button>
            <button
              type="button"
              title="Clear all"
              onMouseDown={e => { e.preventDefault(); clr(); }}
              className="h-10 rounded-lg border border-slate-200 bg-white text-rose-500 text-xs font-bold tracking-wide hover:bg-rose-50 hover:border-rose-300 active:scale-95 transition-all shadow-sm"
            >
              CLR
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
