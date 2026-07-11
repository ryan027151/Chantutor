import { useRef, useState, useCallback } from "react";
import type { PencilStroke, PencilPoint } from "../hooks/useELATools";

interface Props {
  active: boolean;
  strokes: PencilStroke[];
  onAddStroke: (stroke: PencilStroke) => void;
}

function pointsToPath(pts: PencilPoint[]): string {
  if (pts.length < 2) return "";
  const d = pts.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = pts[i - 1];
    // Quadratic bezier control point = midpoint of prev + current
    const cx = (prev.x + p.x) / 2;
    const cy = (prev.y + p.y) / 2;
    return `${acc} Q ${prev.x} ${prev.y} ${cx} ${cy}`;
  }, "");
  return d;
}

export default function ELAPencilCanvas({ active, strokes, onAddStroke }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [currentPoints, setCurrentPoints] = useState<PencilPoint[]>([]);
  const drawing = useRef(false);

  const getSVGPoint = useCallback((e: React.MouseEvent): PencilPoint => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  function handleMouseDown(e: React.MouseEvent) {
    if (!active || e.button !== 0) return;
    drawing.current = true;
    setCurrentPoints([getSVGPoint(e)]);
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!drawing.current || !active) return;
    setCurrentPoints(prev => [...prev, getSVGPoint(e)]);
  }

  function handleMouseUp(e: React.MouseEvent) {
    if (!drawing.current) return;
    drawing.current = false;
    setCurrentPoints(prev => {
      if (prev.length > 1) {
        onAddStroke({
          id: `s${Date.now()}${Math.random().toString(36).slice(2)}`,
          points: [...prev, getSVGPoint(e)],
        });
      }
      return [];
    });
  }

  function handleMouseLeave() {
    if (drawing.current) {
      drawing.current = false;
      setCurrentPoints(prev => {
        if (prev.length > 1) {
          onAddStroke({
            id: `s${Date.now()}${Math.random().toString(36).slice(2)}`,
            points: prev,
          });
        }
        return [];
      });
    }
  }

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 w-full h-full rounded-2xl overflow-hidden"
      style={{
        pointerEvents: active ? "all" : "none",
        cursor: active ? "crosshair" : "default",
        zIndex: 20,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {/* Committed strokes */}
      {strokes.map(stroke => (
        <path
          key={stroke.id}
          d={pointsToPath(stroke.points)}
          stroke="#1e3a8a"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.75"
        />
      ))}
      {/* In-progress stroke */}
      {currentPoints.length > 1 && (
        <path
          d={pointsToPath(currentPoints)}
          stroke="#1e3a8a"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.75"
        />
      )}
    </svg>
  );
}
