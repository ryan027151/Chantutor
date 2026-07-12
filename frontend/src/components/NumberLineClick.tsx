// Interactive number line for number_line_click questions.
// Student clicks or drags to place a single point on the line.
// Read-only mode shows the student's point and the correct answer simultaneously.

import { useEffect, useRef, useState } from "react";

interface Props {
  min?: number;
  max?: number;
  step?: number;
  onAnswerChange?: (value: string) => void;
  isReadOnly?: boolean;
  previousAnswer?: string | null;
  correctAnswer?: string;
}

export default function NumberLineClick({
  min = -10, max = 10, step = 1,
  onAnswerChange,
  isReadOnly = false,
  previousAnswer,
  correctAnswer,
}: Props) {
  // ── Layout constants ──────────────────────────────────────────────────────
  const SVG_W  = 520;
  const SVG_H  = 92;
  const PAD    = 46;             // px from edge to where line starts/ends
  const LINE_W = SVG_W - PAD * 2;
  const LINE_Y = 46;             // y-center of the line
  const MAJ_H  = 11;             // half-height of major tick
  const MIN_H  = 5;              // half-height of minor tick

  const range     = max - min;
  const pxPerUnit = LINE_W / range;

  const toX    = (v: number) => PAD + (v - min) * pxPerUnit;
  const toVal  = (svgX: number) => (svgX - PAD) / pxPerUnit + min;
  const snapTo = (v: number): number => {
    const s = Math.round(v / step) * step;
    // clamp and fix float precision
    return parseFloat(Math.max(min, Math.min(max, s)).toFixed(10));
  };

  const defaultVal = snapTo((min + max) / 2);
  const [value,    setValue]    = useState(defaultVal);
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const cbRef  = useRef(onAnswerChange);
  useEffect(() => { cbRef.current = onAnswerChange; });

  // Emit on mount so the test always has an answer (like SHSATGrapher)
  useEffect(() => {
    if (!isReadOnly) cbRef.current?.(String(defaultVal));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Pointer interaction ───────────────────────────────────────────────────
  const applyPointer = (clientX: number) => {
    if (!svgRef.current || isReadOnly) return;
    const rect  = svgRef.current.getBoundingClientRect();
    const svgX  = (clientX - rect.left) * (SVG_W / rect.width);
    const snapped = snapTo(toVal(svgX));
    setValue(snapped);
    cbRef.current?.(String(snapped));
  };

  const onMouseDown  = (e: React.MouseEvent<SVGSVGElement>)  => { if (isReadOnly) return; setDragging(true);  applyPointer(e.clientX); };
  const onMouseMove  = (e: React.MouseEvent<SVGSVGElement>)  => { if (dragging)   applyPointer(e.clientX); };
  const onMouseUp    = () => setDragging(false);
  const onTouchStart = (e: React.TouchEvent<SVGSVGElement>)  => { if (isReadOnly) return; setDragging(true);  applyPointer(e.touches[0].clientX); };
  const onTouchMove  = (e: React.TouchEvent<SVGSVGElement>)  => { e.preventDefault(); if (dragging) applyPointer(e.touches[0].clientX); };

  // ── Parse answer strings ──────────────────────────────────────────────────
  const parseNum = (s?: string | null): number | null => {
    if (s == null || s === "") return null;
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  };

  const studentVal = parseNum(previousAnswer);
  const correctVal = parseNum(correctAnswer);
  const liveVal    = isReadOnly ? studentVal : value;

  // Considered correct if within half a step (both are snapped, so this is exact)
  const isCorrect = isReadOnly
    && studentVal !== null
    && correctVal !== null
    && Math.abs(studentVal - correctVal) < step * 0.5;

  // ── Build tick list ───────────────────────────────────────────────────────
  // We place a tick at every step increment. Major ticks = integers (or every `step`
  // if step >= 1). Labels are shown every labelStep to avoid crowding.

  const numSteps = Math.round(range / step);

  // For step >= 1 every tick is "major". For step < 1, only integer positions are major.
  const tickIsMajor = (v: number) =>
    step >= 1 ? true : Math.abs(Math.round(v) - v) < step * 0.001;

  // Determine label interval: double until ≤ 11 label positions across the range.
  let labelStep = step >= 1 ? step : 1;
  while (Math.round(range / labelStep) > 10) {
    labelStep = parseFloat((labelStep * 2).toFixed(10));
  }
  const isLabeled = (v: number) =>
    Math.abs(Math.round(v / labelStep) * labelStep - v) < step * 0.001;

  const fmtVal = (v: number) => {
    if (Number.isInteger(v)) return String(v);
    return String(parseFloat(v.toFixed(6)));
  };

  // ── Tooltip x-clamp (so it never overflows the SVG) ──────────────────────
  const tipX = (cx: number) => Math.max(PAD + 22, Math.min(SVG_W - PAD - 22, cx));

  return (
    <div style={{ userSelect: "none", display: "flex", flexDirection: "column", gap: 10 }}>
      {/* ── SVG ── */}
      <div style={{
        border: "1px solid #e2e8f0", borderRadius: 10,
        padding: "6px 4px 4px", background: "#fff",
        boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
        overflow: "hidden",
      }}>
        <svg
          ref={svgRef}
          width={SVG_W}
          height={SVG_H}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          style={{
            display: "block",
            touchAction: "none",
            maxWidth: "100%",
            cursor: isReadOnly ? "default" : "crosshair",
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onMouseUp}
        >
          <rect x={0} y={0} width={SVG_W} height={SVG_H} fill="#fafbfc" rx={8} />

          {/* ── Axis line ── */}
          <line
            x1={PAD} y1={LINE_Y} x2={PAD + LINE_W} y2={LINE_Y}
            stroke="#374151" strokeWidth={2} strokeLinecap="round"
          />
          {/* Right arrowhead */}
          <polygon
            points={`${PAD + LINE_W + 2},${LINE_Y} ${PAD + LINE_W - 8},${LINE_Y - 4} ${PAD + LINE_W - 8},${LINE_Y + 4}`}
            fill="#374151"
          />
          {/* Left arrowhead */}
          <polygon
            points={`${PAD - 2},${LINE_Y} ${PAD + 8},${LINE_Y - 4} ${PAD + 8},${LINE_Y + 4}`}
            fill="#374151"
          />

          {/* ── Ticks + labels ── */}
          {Array.from({ length: numSteps + 1 }, (_, i) => {
            const v   = parseFloat((min + i * step).toFixed(10));
            const x   = toX(v);
            const maj = tickIsMajor(v);
            const h   = maj ? MAJ_H : MIN_H;
            const lbl = isLabeled(v);
            return (
              <g key={i} pointerEvents="none">
                <line
                  x1={x} y1={LINE_Y - h} x2={x} y2={LINE_Y + h}
                  stroke={maj ? "#6b7280" : "#9ca3af"}
                  strokeWidth={maj ? 1.5 : 0.9}
                />
                {lbl && (
                  <text
                    x={x} y={LINE_Y + MAJ_H + 15}
                    fontSize="10.5" fill="#9ca3af"
                    textAnchor="middle"
                    fontFamily="ui-monospace, monospace"
                  >
                    {fmtVal(v)}
                  </text>
                )}
              </g>
            );
          })}

          {/* ── Correct answer dot (review mode — green, rendered first so student dot renders on top) ── */}
          {isReadOnly && correctVal !== null && (() => {
            const cx = toX(correctVal);
            const tx = tipX(cx);
            return (
              <g pointerEvents="none">
                {/* Glow */}
                <circle cx={cx} cy={LINE_Y} r={12} fill="rgba(16,185,129,0.15)" />
                {/* Dot */}
                <circle cx={cx} cy={LINE_Y} r={8} fill="#10b981" />
                {/* Value callout above */}
                <rect x={tx - 22} y={8} width={44} height={18} rx={4} fill="#059669" />
                <text x={tx} y={21} fontSize="11" fill="#fff"
                  fontWeight="700" textAnchor="middle"
                  fontFamily="ui-monospace, monospace">
                  {fmtVal(correctVal)}
                </text>
                {/* Connector line from callout to dot */}
                <line x1={cx} y1={26} x2={cx} y2={LINE_Y - 12}
                  stroke="#059669" strokeWidth={1.5} strokeDasharray="3,2" />
              </g>
            );
          })()}

          {/* ── Student / live dot ── */}
          {liveVal !== null && (() => {
            const cx     = toX(liveVal);
            const tx     = tipX(cx);
            const stroke = isReadOnly
              ? (isCorrect ? "#2563eb" : "#ef4444")
              : "#2563eb";

            return (
              <g pointerEvents="none">
                {/* Glow ring in live mode */}
                {!isReadOnly && (
                  <circle cx={cx} cy={LINE_Y} r={16} fill="rgba(37,99,235,0.09)" />
                )}
                <circle
                  cx={cx} cy={LINE_Y}
                  r={dragging ? 9 : 7}
                  fill="#fff" stroke={stroke} strokeWidth={2.5}
                />
                {/* Floating value label (live mode only — tooltip box) */}
                {!isReadOnly && (
                  <>
                    <rect x={tx - 22} y={8} width={44} height={18} rx={4} fill="#1e3a8a" />
                    <text x={tx} y={21} fontSize="11" fill="#fff"
                      fontWeight="700" textAnchor="middle"
                      fontFamily="ui-monospace, monospace">
                      {fmtVal(value)}
                    </text>
                    <line x1={cx} y1={26} x2={cx} y2={LINE_Y - 10}
                      stroke="#1e3a8a" strokeWidth={1.5} strokeDasharray="3,2" />
                  </>
                )}
              </g>
            );
          })()}
        </svg>
      </div>

      {/* ── Legend / instruction strip ── */}
      {isReadOnly ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 12.5 }}>
          {previousAnswer != null && previousAnswer !== "" && (
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <svg width={16} height={16} viewBox="0 0 16 16">
                <circle cx={8} cy={8} r={6} fill="#fff"
                  stroke={isCorrect ? "#2563eb" : "#ef4444"} strokeWidth={2.5} />
              </svg>
              <span style={{ color: "#374151" }}>
                Your answer:&nbsp;
                <strong style={{ fontFamily: "monospace" }}>
                  {studentVal !== null ? fmtVal(studentVal) : "—"}
                </strong>
              </span>
            </div>
          )}
          {correctVal !== null && (
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <svg width={16} height={16} viewBox="0 0 16 16">
                <circle cx={8} cy={8} r={7} fill="#10b981" />
              </svg>
              <span style={{ color: "#065f46", fontWeight: 600 }}>
                Correct:&nbsp;
                <strong style={{ fontFamily: "monospace" }}>{fmtVal(correctVal)}</strong>
              </span>
            </div>
          )}
        </div>
      ) : (
        <div style={{
          fontSize: 11.5, color: "#6b7280", lineHeight: 1.5,
          background: "#f8fafc", border: "1px solid #e2e8f0",
          borderRadius: 8, padding: "8px 12px",
        }}>
          Click or drag to place your answer on the number line.
        </div>
      )}
    </div>
  );
}
