import { useRef } from "react";

interface Props {
  maskY: number;          // top of the transparent window, px from container top
  onMove: (y: number) => void;
}

const WINDOW_HEIGHT = 72; // ~3 lines of text

export default function ELALineMask({ maskY, onMove }: Props) {
  const dragRef = useRef<{ startY: number; initMaskY: number } | null>(null);

  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, initMaskY: maskY };

    function handleMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      const delta = ev.clientY - dragRef.current.startY;
      onMove(Math.max(0, dragRef.current.initMaskY + delta));
    }
    function handleUp() {
      dragRef.current = null;
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    }
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }

  return (
    <div
      className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none"
      style={{ zIndex: 10 }}
    >
      {/* Top dark band */}
      <div
        className="absolute left-0 right-0 top-0 bg-slate-900/40"
        style={{ height: maskY }}
      />
      {/* Transparent window — drag handle */}
      <div
        className="absolute left-0 right-0 border-y-2 border-amber-400/60 pointer-events-auto cursor-ns-resize"
        style={{ top: maskY, height: WINDOW_HEIGHT }}
        onMouseDown={startDrag}
        title="Drag to move the line guide"
      />
      {/* Bottom dark band */}
      <div
        className="absolute left-0 right-0 bottom-0 bg-slate-900/40"
        style={{ top: maskY + WINDOW_HEIGHT }}
      />
    </div>
  );
}
