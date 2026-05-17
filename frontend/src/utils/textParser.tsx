import { ReactNode } from "react";

// Parses question text that contains <b>, <u>, <i> formatting tags and \n newlines.
// Returns an array of React nodes safe to render inside any element.
// Nesting tags (e.g. <b><i>text</i></b>) is not supported — tags must be flat.
export function parseFormattedText(text: string): ReactNode[] {
  if (!text) return [];

  // Ensure a space exists on both sides of every inline tag if not already there.
  // Handles data like "word<b>bold</b>word" → "word <b>bold</b> word".
  // Does not add a space before punctuation after a closing tag.
  const normalized = text
    .replace(/(\S)(<[bui]>)/g, "$1 $2")
    .replace(/(<\/[bui]>)([^\s.,;:!?'"])/g, "$1 $2");

  const TAG_REGEX = /(<b>.*?<\/b>|<u>.*?<\/u>|<i>.*?<\/i>)/gs;
  const parts = normalized.split(TAG_REGEX);
  const result: ReactNode[] = [];

  parts.forEach((part, index) => {
    if (part.startsWith("<b>") && part.endsWith("</b>")) {
      const inner = part.slice(3, -4);
      const lead = inner.match(/^(\s+)/)?.[1] ?? "";
      const trail = inner.match(/(\s+)$/)?.[1] ?? "";
      if (lead) result.push(lead);
      result.push(<strong key={`b-${index}`}>{inner.trim()}</strong>);
      if (trail) result.push(trail);
    } else if (part.startsWith("<u>") && part.endsWith("</u>")) {
      const inner = part.slice(3, -4);
      const lead = inner.match(/^(\s+)/)?.[1] ?? "";
      const trail = inner.match(/(\s+)$/)?.[1] ?? "";
      if (lead) result.push(lead);
      result.push(<u key={`u-${index}`}>{inner.trim()}</u>);
      if (trail) result.push(trail);
    } else if (part.startsWith("<i>") && part.endsWith("</i>")) {
      const inner = part.slice(3, -4);
      const lead = inner.match(/^(\s+)/)?.[1] ?? "";
      const trail = inner.match(/(\s+)$/)?.[1] ?? "";
      if (lead) result.push(lead);
      result.push(<em key={`i-${index}`}>{inner.trim()}</em>);
      if (trail) result.push(trail);
    } else {
      // Plain text — split on newlines and insert <br /> between lines
      const lines = part.split("\n");
      lines.forEach((line, lineIdx) => {
        result.push(line);
        if (lineIdx < lines.length - 1) {
          result.push(<br key={`br-${index}-${lineIdx}`} />);
        }
      });
    }
  });

  return result;
}
