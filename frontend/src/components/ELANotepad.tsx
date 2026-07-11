import { useRef, useState } from "react";

interface Props {
  open: boolean;
  notes: string;
  onNotesChange: (v: string) => void;
  onClose: () => void;
}

export default function ELANotepad({ open, notes, onNotesChange, onClose }: Props) {
  const dragRef = useRef<{ startX: number; startY: number; initLeft: number; initTop: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 24, top: 120 });

  function onDragStart(e: React.MouseEvent) {
    if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initLeft: pos.left,
      initTop: pos.top,
    };
    e.preventDefault();

    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      setPos({
        left: Math.max(0, dragRef.current.initLeft + ev.clientX - dragRef.current.startX),
        top: Math.max(0, dragRef.current.initTop + ev.clientY - dragRef.current.startY),
      });
    }
    function onUp() {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      style={{ left: pos.left, top: pos.top, zIndex: 50 }}
      className="fixed w-64 sm:w-80 bg-amber-50 border border-amber-200 rounded-2xl shadow-xl flex flex-col overflow-hidden"
    >
      {/* Header — drag handle */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-amber-400/20 border-b border-amber-200 cursor-grab active:cursor-grabbing select-none"
        onMouseDown={onDragStart}
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span className="text-xs font-bold text-amber-800 uppercase tracking-widest">Notepad</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-full text-amber-600 hover:bg-amber-200 transition-colors text-sm leading-none"
        >
          ✕
        </button>
      </div>
      {/* Textarea */}
      <textarea
        value={notes}
        onChange={e => onNotesChange(e.target.value)}
        placeholder="Type your notes here…"
        className="flex-1 resize-none bg-amber-50 text-sm text-slate-800 px-3 py-2.5 placeholder-amber-300 focus:outline-none min-h-[180px]"
      />
    </div>
  );
}
