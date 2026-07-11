import { useState, useCallback } from "react";

export type ELATool = "highlight" | "eliminate" | "pencil" | "linereader" | null;

export interface HighlightRect {
  id: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface PencilPoint { x: number; y: number; }
export interface PencilStroke { id: string; points: PencilPoint[]; }

interface PencilState { strokes: PencilStroke[]; undone: PencilStroke[]; }

export function useELATools() {
  const [activeTool, setActiveTool] = useState<ELATool>(null);

  // Highlights keyed by a container key (e.g. "p-{uid}" for passage, "q-{uid}" for question)
  const [highlights, setHighlights] = useState<Map<string, HighlightRect[]>>(new Map());

  // Eliminated answer choice letters keyed by question UID
  const [eliminations, setEliminations] = useState<Map<string, Set<string>>>(new Map());

  // Notepad
  const [notes, setNotes] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);

  // Pencil strokes + undo stack, keyed by question UID
  const [pencil, setPencil] = useState<Map<string, PencilState>>(new Map());

  // Line reader mask: Y position of the transparent window top edge (px from container top)
  const [lineMaskY, setLineMaskY] = useState(120);

  // Bookmarked question UIDs
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());

  const toggleTool = useCallback((tool: ELATool) => {
    setActiveTool(prev => prev === tool ? null : tool);
  }, []);

  // ── Highlights ──────────────────────────────────────────────────────────────

  const addHighlights = useCallback((key: string, rects: HighlightRect[]) => {
    if (!rects.length) return;
    setHighlights(prev => {
      const next = new Map(prev);
      next.set(key, [...(prev.get(key) ?? []), ...rects]);
      return next;
    });
  }, []);

  const clearHighlights = useCallback((key: string) => {
    setHighlights(prev => {
      const next = new Map(prev);
      next.set(key, []);
      return next;
    });
  }, []);

  // ── Eliminations ────────────────────────────────────────────────────────────

  const toggleElimination = useCallback((uid: string, letter: string) => {
    setEliminations(prev => {
      const next = new Map(prev);
      const set = new Set(prev.get(uid));
      if (set.has(letter)) set.delete(letter); else set.add(letter);
      next.set(uid, set);
      return next;
    });
  }, []);

  // ── Pencil ───────────────────────────────────────────────────────────────────

  const addStroke = useCallback((uid: string, stroke: PencilStroke) => {
    setPencil(prev => {
      const s = prev.get(uid) ?? { strokes: [], undone: [] };
      const next = new Map(prev);
      next.set(uid, { strokes: [...s.strokes, stroke], undone: [] });
      return next;
    });
  }, []);

  const undoStroke = useCallback((uid: string) => {
    setPencil(prev => {
      const s = prev.get(uid);
      if (!s?.strokes.length) return prev;
      const next = new Map(prev);
      next.set(uid, {
        strokes: s.strokes.slice(0, -1),
        undone: [...s.undone, s.strokes[s.strokes.length - 1]],
      });
      return next;
    });
  }, []);

  const redoStroke = useCallback((uid: string) => {
    setPencil(prev => {
      const s = prev.get(uid);
      if (!s?.undone.length) return prev;
      const next = new Map(prev);
      next.set(uid, {
        strokes: [...s.strokes, s.undone[s.undone.length - 1]],
        undone: s.undone.slice(0, -1),
      });
      return next;
    });
  }, []);

  const clearStrokes = useCallback((uid: string) => {
    setPencil(prev => {
      const next = new Map(prev);
      next.set(uid, { strokes: [], undone: [] });
      return next;
    });
  }, []);

  const getPencilState = useCallback((uid: string): PencilState => {
    return pencil.get(uid) ?? { strokes: [], undone: [] };
  }, [pencil]);

  // ── Bookmarks ────────────────────────────────────────────────────────────────

  const toggleBookmark = useCallback((uid: string) => {
    setBookmarks(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  }, []);

  return {
    activeTool, setActiveTool, toggleTool,
    highlights,
    addHighlights, clearHighlights,
    eliminations, toggleElimination,
    notes, setNotes,
    notesOpen, toggleNotes: () => setNotesOpen(o => !o),
    getPencilState, addStroke, undoStroke, redoStroke, clearStrokes,
    lineMaskY, setLineMaskY,
    bookmarks, toggleBookmark,
  };
}

export type ELATools = ReturnType<typeof useELATools>;
