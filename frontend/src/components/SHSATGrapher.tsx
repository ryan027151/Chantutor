// Interactive coordinate-plane grapher for linear_graphing questions.
// The student drags two points; the line through them is their answer.
// In read-only mode (review) both the student's line and the correct line are displayed.

import { useEffect, useRef, useState } from "react";

interface Point { x: number; y: number; }

type LineEq =
  | { vertical: true; x: number }
  | { vertical: false; m: number; b: number };

function slopeIntercept(p1: Point, p2: Point): LineEq {
  if (p1.x === p2.x) return { vertical: true, x: p1.x };
  const m = (p2.y - p1.y) / (p2.x - p1.x);
  return { vertical: false, m, b: p1.y - m * p1.x };
}

// Clips the infinite line to the [-RANGE, RANGE] viewport and returns the two border endpoints.
function lineEndpoints(p1: Point, p2: Point, R: number): [Point, Point] {
  const eq = slopeIntercept(p1, p2);
  if (eq.vertical) return [{ x: eq.x, y: -R }, { x: eq.x, y: R }];
  const { m, b } = eq;
  const cands: (Point | null)[] = [
    { x: -R, y: m * -R + b },
    { x:  R, y: m *  R + b },
    m !== 0 ? { x: ( R - b) / m, y:  R } : null,
    m !== 0 ? { x: (-R - b) / m, y: -R } : null,
  ];
  const inside = cands.filter(
    (p): p is Point =>
      !!p &&
      p.x >= -R - 0.001 && p.x <= R + 0.001 &&
      p.y >= -R - 0.001 && p.y <= R + 0.001,
  );
  const uniq: Point[] = [];
  for (const c of inside) {
    if (!uniq.some(u => Math.abs(u.x - c.x) < 0.01 && Math.abs(u.y - c.y) < 0.01))
      uniq.push(c);
  }
  return [uniq[0] ?? p1, uniq[1] ?? p2];
}

// Given stored answer params {m, b} or {vertical, x}, produce two points that define the line.
function pointsFromAnswer(ans: { m?: number; b?: number; vertical?: boolean; x?: number }, R: number): [Point, Point] {
  if (ans.vertical) return [{ x: ans.x ?? 0, y: -R }, { x: ans.x ?? 0, y: R }];
  const m = ans.m ?? 0;
  const b = ans.b ?? 0;
  return [{ x: -R, y: m * -R + b }, { x: R, y: m * R + b }];
}

// Human-readable equation label, e.g. "y = 2x − 3" or "x = 4".
function equationLabel(p1: Point, p2: Point): string {
  const eq = slopeIntercept(p1, p2);
  if (eq.vertical) return `x = ${eq.x}`;
  const { m, b } = eq;
  const fmt = (v: number) =>
    Number.isInteger(v) ? v.toString() : v.toFixed(2).replace(/\.?0+$/, "");
  const mPart = m === 1 ? "x" : m === -1 ? "-x" : `${fmt(m)}x`;
  const bPart =
    b === 0 ? "" : b > 0 ? ` + ${fmt(b)}` : ` − ${fmt(Math.abs(b))}`;
  return `y = ${mPart}${bPart}`;
}

// ── Component ──────────────────────────────────────────────────────────────────

interface SHSATGrapherProps {
  /** Called with JSON string {"p1":…,"p2":…} whenever the student moves a point */
  onAnswerChange?: (json: string) => void;
  isReadOnly?: boolean;
  /** JSON string {"p1":…,"p2":…} — the student's submitted answer (review mode) */
  previousAnswer?: string;
  /** JSON string {"m":…,"b":…} or {"vertical":true,"x":…} — correct answer (review mode) */
  correctAnswer?: string;
}

export default function SHSATGrapher({
  onAnswerChange,
  isReadOnly = false,
  previousAnswer,
  correctAnswer,
}: SHSATGrapherProps) {
  const SIZE = 420;
  const RANGE = 10;
  const STEP = SIZE / (RANGE * 2);   // px per grid unit
  const ORIGIN = SIZE / 2;           // px coordinate of (0,0)

  // Student's two draggable points — default to a flat line at y = 0
  const [p1, setP1] = useState<Point>({ x: -5, y: 0 });
  const [p2, setP2] = useState<Point>({ x:  5, y: 0 });
  const [dragging, setDragging] = useState<"p1" | "p2" | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Keep the latest callback in a ref so effects don't re-run when it changes
  const cbRef = useRef(onAnswerChange);
  useEffect(() => { cbRef.current = onAnswerChange; });

  // Notify parent on mount (so chosenAnswer is never empty for a graphing question)
  useEffect(() => {
    if (!isReadOnly) cbRef.current?.(JSON.stringify({ p1, p2 }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Coordinate converters
  const toPx  = (x: number, y: number) => ({ x: ORIGIN + x * STEP, y: ORIGIN - y * STEP });
  const toMath = (px: number, py: number) => ({
    x: (px - ORIGIN) / STEP,
    y: (ORIGIN - py) / STEP,
  });
  const snap = (v: number) => Math.max(-RANGE, Math.min(RANGE, Math.round(v)));

  // ── Drag logic ─────────────────────────────────────────────────────────────

  const applyDrag = (clientX: number, clientY: number) => {
    if (!dragging || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const raw  = toMath(
      (clientX - rect.left) * (SIZE / rect.width),
      (clientY - rect.top)  * (SIZE / rect.height),
    );
    const snapped = { x: snap(raw.x), y: snap(raw.y) };

    // Prevent both points from landing on the same coordinate
    const other = dragging === "p1" ? p2 : p1;
    if (snapped.x === other.x && snapped.y === other.y) return;

    if (dragging === "p1") {
      setP1(snapped);
      cbRef.current?.(JSON.stringify({ p1: snapped, p2 }));
    } else {
      setP2(snapped);
      cbRef.current?.(JSON.stringify({ p1, p2: snapped }));
    }
  };

  const onMouseMove  = (e: React.MouseEvent<SVGSVGElement>) => applyDrag(e.clientX, e.clientY);
  const onTouchMove  = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 0) return;
    e.preventDefault();
    applyDrag(e.touches[0].clientX, e.touches[0].clientY);
  };
  const stopDrag = () => setDragging(null);

  // ── Derived display values ─────────────────────────────────────────────────

  // In review mode, show the student's submitted points instead of the live state
  const displayP1 = isReadOnly && previousAnswer
    ? (() => { try { return JSON.parse(previousAnswer).p1 as Point; } catch { return p1; } })()
    : p1;
  const displayP2 = isReadOnly && previousAnswer
    ? (() => { try { return JSON.parse(previousAnswer).p2 as Point; } catch { return p2; } })()
    : p2;

  // Correct answer line endpoints (for review mode)
  const correctEnds: [Point, Point] | null = (() => {
    if (!correctAnswer) return null;
    try {
      const params = JSON.parse(correctAnswer);
      const [a, b] = pointsFromAnswer(params, RANGE);
      return lineEndpoints(a, b, RANGE);
    } catch { return null; }
  })();

  const [e1, e2] = lineEndpoints(displayP1, displayP2, RANGE);
  const gridLines: number[] = [];
  for (let i = -RANGE; i <= RANGE; i++) if (i !== 0) gridLines.push(i);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap", userSelect: "none" }}>

      {/* ── Coordinate plane SVG ── */}
      <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 6, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <svg
          ref={svgRef}
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          style={{ display: "block", touchAction: "none", maxWidth: "100%" }}
          onMouseMove={onMouseMove}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
          onTouchMove={onTouchMove}
          onTouchEnd={stopDrag}
        >
          <rect x={0} y={0} width={SIZE} height={SIZE} fill="#fafbfc" />

          {/* Grid */}
          {gridLines.map(i => (
            <g key={i}>
              <line
                x1={toPx(i, -RANGE).x} y1={toPx(i, -RANGE).y}
                x2={toPx(i,  RANGE).x} y2={toPx(i,  RANGE).y}
                stroke={i % 5 === 0 ? "#c8d0d9" : "#e8eaed"} strokeWidth={i % 5 === 0 ? 1 : 0.75}
              />
              <line
                x1={toPx(-RANGE, i).x} y1={toPx(-RANGE, i).y}
                x2={toPx( RANGE, i).x} y2={toPx( RANGE, i).y}
                stroke={i % 5 === 0 ? "#c8d0d9" : "#e8eaed"} strokeWidth={i % 5 === 0 ? 1 : 0.75}
              />
            </g>
          ))}

          {/* Axes */}
          <line x1={toPx(-RANGE, 0).x} y1={ORIGIN} x2={toPx(RANGE, 0).x} y2={ORIGIN} stroke="#374151" strokeWidth={1.5} />
          <line x1={ORIGIN} y1={toPx(0, -RANGE).y} x2={ORIGIN} y2={toPx(0, RANGE).y} stroke="#374151" strokeWidth={1.5} />

          {/* Axis arrow tips */}
          <polygon points={`${toPx(RANGE, 0).x},${ORIGIN} ${toPx(RANGE, 0).x - 7},${ORIGIN - 4} ${toPx(RANGE, 0).x - 7},${ORIGIN + 4}`} fill="#374151" />
          <polygon points={`${ORIGIN},${toPx(0, RANGE).y} ${ORIGIN - 4},${toPx(0, RANGE).y + 7} ${ORIGIN + 4},${toPx(0, RANGE).y + 7}`} fill="#374151" />

          {/* Axis labels */}
          <text x={toPx(RANGE, 0).x - 3} y={ORIGIN + 16} fontSize="11" fill="#374151" fontFamily="serif" fontStyle="italic">x</text>
          <text x={ORIGIN + 8} y={toPx(0, RANGE).y + 4} fontSize="11" fill="#374151" fontFamily="serif" fontStyle="italic">y</text>

          {/* Tick labels — every 2 units */}
          {gridLines.filter(i => i % 2 === 0).map(i => (
            <g key={`t-${i}`}>
              <text x={toPx(i, 0).x} y={ORIGIN + 15} fontSize="9.5" fill="#9ca3af" textAnchor="middle" fontFamily="ui-monospace, monospace">{i}</text>
              <text x={ORIGIN - 6} y={toPx(0, i).y + 3.5} fontSize="9.5" fill="#9ca3af" textAnchor="end" fontFamily="ui-monospace, monospace">{i}</text>
            </g>
          ))}
          <text x={ORIGIN - 6} y={ORIGIN + 15} fontSize="9.5" fill="#9ca3af" textAnchor="end" fontFamily="ui-monospace, monospace">0</text>

          {/* ── Correct answer line (review: green) ── */}
          {correctEnds && (() => {
            const [ce1, ce2] = correctEnds;
            return (
              <line
                x1={toPx(ce1.x, ce1.y).x} y1={toPx(ce1.x, ce1.y).y}
                x2={toPx(ce2.x, ce2.y).x} y2={toPx(ce2.x, ce2.y).y}
                stroke="#10b981" strokeWidth={3} strokeLinecap="round"
              />
            );
          })()}

          {/* ── Student's line ── */}
          <line
            x1={toPx(e1.x, e1.y).x} y1={toPx(e1.x, e1.y).y}
            x2={toPx(e2.x, e2.y).x} y2={toPx(e2.x, e2.y).y}
            stroke={isReadOnly ? "#6b7280" : "#2563eb"}
            strokeWidth={isReadOnly ? 2 : 2.5}
            opacity={isReadOnly ? 0.65 : 1}
            strokeLinecap="round"
          />

          {/* ── Interactive draggable points (live mode) ── */}
          {!isReadOnly && ([
            { key: "p1" as const, pt: p1 },
            { key: "p2" as const, pt: p2 },
          ]).map(({ key, pt }) => {
            const px = toPx(pt.x, pt.y);
            const isDrag = dragging === key;
            return (
              <g key={key}>
                {/* Large transparent hit area */}
                <circle
                  cx={px.x} cy={px.y} r={18}
                  fill="transparent"
                  style={{ cursor: isDrag ? "grabbing" : "grab" }}
                  onMouseDown={e => { e.stopPropagation(); setDragging(key); }}
                  onTouchStart={e => { e.stopPropagation(); setDragging(key); }}
                />
                {/* Visible point */}
                <circle
                  cx={px.x} cy={px.y}
                  r={isDrag ? 8 : 6}
                  fill="#fff" stroke="#2563eb" strokeWidth={2.5}
                  style={{ pointerEvents: "none" }}
                />
                {/* Coordinate tooltip while dragging */}
                {isDrag && (
                  <g pointerEvents="none">
                    <rect x={px.x + 10} y={px.y - 24} width={60} height={18} rx={3} fill="#1e293b" />
                    <text x={px.x + 40} y={px.y - 11} fontSize="11" fill="#fff" textAnchor="middle" fontFamily="ui-monospace, monospace">
                      ({pt.x}, {pt.y})
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* ── Static points in review mode ── */}
          {isReadOnly && [displayP1, displayP2].map((pt, i) => {
            const px = toPx(pt.x, pt.y);
            return (
              <circle key={i} cx={px.x} cy={px.y} r={5}
                fill="#fff" stroke="#6b7280" strokeWidth={2}
                style={{ pointerEvents: "none" }}
              />
            );
          })}
        </svg>
      </div>

      {/* ── Right-side panel ── */}
      {!isReadOnly ? (
        // Live mode: show current equation + point coordinates + instructions
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 172 }}>
          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b7280", marginBottom: 4 }}>
              Your line
            </div>
            <div style={{ fontSize: 15, fontFamily: "ui-monospace, monospace", color: "#1e3a5f", fontWeight: 700 }}>
              {equationLabel(p1, p2)}
            </div>
          </div>

          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b7280", marginBottom: 8 }}>
              Points
            </div>
            {[p1, p2].map((pt, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: i === 0 ? 6 : 0 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", border: "2.5px solid #2563eb", background: "#fff", flexShrink: 0 }} />
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, color: "#374151" }}>
                  ({pt.x}, {pt.y})
                </span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11.5, color: "#6b7280", lineHeight: 1.55, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px" }}>
            Drag either point to reshape your line. Points snap to integer coordinates.
          </div>
        </div>
      ) : (
        // Review mode: legend
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 160, paddingTop: 4 }}>
          {previousAnswer && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 28, height: 3, background: "#6b7280", borderRadius: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: "#4b5563" }}>Your answer</span>
            </div>
          )}
          {correctEnds && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 28, height: 3, background: "#10b981", borderRadius: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: "#065f46", fontWeight: 600 }}>Correct answer</span>
            </div>
          )}
          {previousAnswer && (() => {
            try {
              const { p1: sp1, p2: sp2 } = JSON.parse(previousAnswer) as { p1: Point; p2: Point };
              return (
                <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280", fontFamily: "ui-monospace, monospace" }}>
                  Your line: {equationLabel(sp1, sp2)}
                </div>
              );
            } catch { return null; }
          })()}
        </div>
      )}
    </div>
  );
}
