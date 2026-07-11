import type { ELATool, ELATools } from "../hooks/useELATools";

interface Props {
  tools: ELATools;
  questionUid: string;
}

interface ToolBtn {
  id: ELATool;
  label: string;
  title: string;
  icon: string; // inline SVG path
}

const TOOL_BTNS: ToolBtn[] = [
  {
    id: "highlight",
    label: "Highlight",
    title: "Highlighter — select text to highlight it",
    icon: "M15.232 5.232l3.536 3.536M9 11l6.364-6.364a2 2 0 012.828 2.828L11.828 13.828A2 2 0 0110.414 14.24L7 15l.76-3.414A2 2 0 019 11z",
  },
  {
    id: "eliminate",
    label: "Eliminate",
    title: "Answer Eliminator — click an answer choice to cross it out",
    icon: "M6 18L18 6M6 6l12 12",
  },
  {
    id: "pencil",
    label: "Draw",
    title: "Digital Pencil — draw on the page",
    icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  },
  {
    id: "linereader",
    label: "Line Guide",
    title: "Line Reader — drag the guide to focus on a line",
    icon: "M4 6h16M4 12h16M4 18h16",
  },
];

export default function ELAToolbar({ tools, questionUid }: Props) {
  const {
    activeTool, toggleTool, toggleNotes, notesOpen,
    getPencilState, undoStroke, redoStroke, clearStrokes,
    clearHighlights,
    highlights,
  } = tools;

  const pencilState = getPencilState(questionUid);
  const passageKey = `p-${questionUid}`;
  const questionKey = `q-${questionUid}`;
  const hasHighlights =
    (highlights.get(passageKey)?.length ?? 0) > 0 ||
    (highlights.get(questionKey)?.length ?? 0) > 0;

  function handleToolClick(id: ELATool) {
    toggleTool(id);
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* Tool buttons */}
      {TOOL_BTNS.map(btn => {
        const active = activeTool === btn.id;
        return (
          <button
            key={btn.id}
            type="button"
            title={btn.title}
            onClick={() => handleToolClick(btn.id)}
            className={`flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-widest transition-all select-none ${
              active
                ? "bg-amber-500 text-zinc-950 shadow-sm"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={btn.icon} />
            </svg>
            <span>{btn.label}</span>
          </button>
        );
      })}

      {/* Separator */}
      <div className="w-px h-8 bg-slate-200 mx-1 shrink-0" />

      {/* Notes button */}
      <button
        type="button"
        title="Notepad — take notes for this section"
        onClick={toggleNotes}
        className={`flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-widest transition-all select-none ${
          notesOpen
            ? "bg-sky-500 text-white shadow-sm"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
        <span>Notes</span>
      </button>

      {/* Pencil sub-controls — shown when pencil is active */}
      {activeTool === "pencil" && (
        <>
          <div className="w-px h-8 bg-slate-200 mx-1 shrink-0" />
          <button
            type="button"
            title="Undo last stroke"
            disabled={!pencilState.strokes.length}
            onClick={() => undoStroke(questionUid)}
            className="flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-widest text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
            <span>Undo</span>
          </button>
          <button
            type="button"
            title="Redo last stroke"
            disabled={!pencilState.undone.length}
            onClick={() => redoStroke(questionUid)}
            className="flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-widest text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
            </svg>
            <span>Redo</span>
          </button>
          <button
            type="button"
            title="Clear all pencil marks on this question"
            disabled={!pencilState.strokes.length}
            onClick={() => clearStrokes(questionUid)}
            className="flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-widest text-rose-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Clear</span>
          </button>
        </>
      )}

      {/* Highlight clear button — shown when highlight is active and there are highlights */}
      {activeTool === "highlight" && hasHighlights && (
        <>
          <div className="w-px h-8 bg-slate-200 mx-1 shrink-0" />
          <button
            type="button"
            title="Clear all highlights on this question"
            onClick={() => { clearHighlights(passageKey); clearHighlights(questionKey); }}
            className="flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-widest text-rose-400 hover:bg-rose-50 hover:text-rose-600 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span>Clear</span>
          </button>
        </>
      )}
    </div>
  );
}
