// Table-row radio question: each row in the table has exactly one radio selection
// across the column headers. Answer format: "A,B,A" — one capital letter per row.

import { useState } from "react";

const LETTERS = ["A", "B", "C", "D", "E", "F"] as const;
type Letter = (typeof LETTERS)[number];

interface Props {
  colHeaders: string[];
  rows: string[];
  chosenAnswer: (answer: string) => void;
  isReadOnly?: boolean;
  previousAnswer?: string;
  correctAnswer?: string;
}

function parseSelections(s: string, n: number): (Letter | null)[] {
  const parts = s ? s.split(",") : [];
  return Array.from({ length: n }, (_, i) => {
    const t = (parts[i] ?? "").trim().toUpperCase();
    return (LETTERS as readonly string[]).includes(t) ? (t as Letter) : null;
  });
}

export default function TableRowRadio({
  colHeaders,
  rows,
  chosenAnswer,
  isReadOnly = false,
  previousAnswer = "",
  correctAnswer = "",
}: Props) {
  const [selections, setSelections] = useState<(Letter | null)[]>(() =>
    // In read-only, parse the submitted answer. In live, all null.
    isReadOnly
      ? parseSelections(previousAnswer, rows.length)
      : rows.map(() => null)
  );

  const correctSels = parseSelections(correctAnswer, rows.length);

  const handleClick = (rowIdx: number, letter: Letter) => {
    if (isReadOnly) return;
    const next = selections.slice();
    next[rowIdx] = letter;
    setSelections(next);
    const allFilled = next.every(s => s !== null);
    // Emit full answer only when every row is filled; otherwise signal "no answer"
    chosenAnswer(allFilled ? next.join(",") : "");
  };

  // In review mode always render from previousAnswer prop
  const liveSels: (Letter | null)[] = isReadOnly
    ? parseSelections(previousAnswer, rows.length)
    : selections;

  const remaining = isReadOnly ? 0 : liveSels.filter(s => s === null).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
        <table
          className="w-full border-collapse text-sm"
          style={{ minWidth: Math.max(400, colHeaders.length * 100 + 200) }}
        >
          <thead>
            <tr>
              {/* Row-label column header */}
              <th
                scope="col"
                className="border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 min-w-45"
              >
                Statement
              </th>
              {colHeaders.map((hdr, ci) => (
                <th
                  key={ci}
                  scope="col"
                  className="border-b border-r last:border-r-0 border-slate-200 bg-slate-50 px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-700 min-w-22"
                >
                  {hdr}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((rowLabel, ri) => {
              const selected   = liveSels[ri];
              const correct    = correctSels[ri];
              const rowCorrect = isReadOnly ? selected === correct : null;

              return (
                <tr
                  key={ri}
                  className={[
                    ri % 2 === 0 ? "bg-white" : "bg-slate-50/40",
                    isReadOnly
                      ? rowCorrect
                        ? "border-l-[3px] border-l-emerald-400"
                        : "border-l-[3px] border-l-rose-400"
                      : "",
                  ].join(" ")}
                >
                  {/* Row label cell */}
                  <td className="border-b border-r border-slate-200 px-4 py-3.5 text-slate-800 leading-relaxed align-middle">
                    {rowLabel}
                  </td>

                  {colHeaders.map((_, ci) => {
                    const letter     = LETTERS[ci];
                    const isSelected = selected === letter;
                    const isCorrect  = correct === letter;

                    // Cell background
                    let cellBg = "";
                    let radioRing = "";
                    let radioDot: React.ReactNode = null;

                    if (isReadOnly) {
                      if (isCorrect && isSelected) {
                        cellBg   = "bg-emerald-50";
                        radioRing = "border-2 border-emerald-500 bg-emerald-500";
                        radioDot  = <span className="block w-2.25 h-2.25 rounded-full bg-white mx-auto" />;
                      } else if (isSelected && !isCorrect) {
                        cellBg   = "bg-rose-50";
                        radioRing = "border-2 border-rose-400 bg-rose-400";
                        radioDot  = <span className="block w-2.25 h-2.25 rounded-full bg-white mx-auto" />;
                      } else if (isCorrect && !isSelected) {
                        // Correct answer the student missed — dashed green ring
                        cellBg   = "bg-emerald-50/50";
                        radioRing = "border-2 border-dashed border-emerald-400 bg-white";
                        radioDot  = <span className="block w-1.75 h-1.75 rounded-full bg-emerald-400 mx-auto" />;
                      } else {
                        radioRing = "border-2 border-slate-200 bg-white";
                      }
                    } else {
                      if (isSelected) {
                        radioRing = "border-2 border-blue-500 bg-blue-500";
                        radioDot  = <span className="block w-2.25 h-2.25 rounded-full bg-white mx-auto" />;
                      } else {
                        radioRing = "border-2 border-slate-300 bg-white group-hover/row:border-blue-200";
                      }
                    }

                    return (
                      <td
                        key={ci}
                        className={`border-b border-r last:border-r-0 border-slate-200 px-3 py-3.5 text-center align-middle ${cellBg}`}
                      >
                        <button
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => handleClick(ri, letter)}
                          aria-label={`Row ${ri + 1}: ${colHeaders[ci]}`}
                          aria-pressed={isSelected}
                          className={[
                            "w-5 h-5 rounded-full flex items-center justify-center mx-auto transition-all",
                            radioRing,
                            isReadOnly ? "cursor-default" : "cursor-pointer hover:scale-110",
                          ].join(" ")}
                        >
                          {radioDot}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Progress hint (live mode) */}
      {!isReadOnly && remaining > 0 && (
        <p className="text-xs text-slate-400 pl-0.5">
          Select one option per row — <strong className="text-slate-500">{remaining}</strong> row{remaining !== 1 ? "s" : ""} remaining.
        </p>
      )}

      {/* Legend (review mode) */}
      {isReadOnly && (
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-500 pl-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block shrink-0" />
            Correct selection
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full border-2 border-dashed border-emerald-400 inline-block shrink-0" />
            Missed (correct)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-400 inline-block shrink-0" />
            Wrong pick
          </span>
        </div>
      )}
    </div>
  );
}
