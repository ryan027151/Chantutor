import { ReactNode } from "react";

// Parses question text that contains <b>, <u>, <i> formatting tags and \n newlines.
// Tags may be nested (e.g. <b>text <u>word</u> text</b>).
// Returns an array of React nodes safe to render inside any element.
export function parseFormattedText(text: string, keyPrefix: string = ""): ReactNode[] {
  if (!text) return [];

  // Ensure a space exists on both sides of every inline tag if not already there.
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
      result.push(
        <strong key={`${keyPrefix}b-${index}`}>
          {parseFormattedText(inner.trim(), `${keyPrefix}b-${index}-`)}
        </strong>
      );
      if (trail) result.push(trail);
    } else if (part.startsWith("<u>") && part.endsWith("</u>")) {
      const inner = part.slice(3, -4);
      const lead = inner.match(/^(\s+)/)?.[1] ?? "";
      const trail = inner.match(/(\s+)$/)?.[1] ?? "";
      if (lead) result.push(lead);
      result.push(
        <u key={`${keyPrefix}u-${index}`}>
          {parseFormattedText(inner.trim(), `${keyPrefix}u-${index}-`)}
        </u>
      );
      if (trail) result.push(trail);
    } else if (part.startsWith("<i>") && part.endsWith("</i>")) {
      const inner = part.slice(3, -4);
      const lead = inner.match(/^(\s+)/)?.[1] ?? "";
      const trail = inner.match(/(\s+)$/)?.[1] ?? "";
      if (lead) result.push(lead);
      result.push(
        <em key={`${keyPrefix}i-${index}`}>
          {parseFormattedText(inner.trim(), `${keyPrefix}i-${index}-`)}
        </em>
      );
      if (trail) result.push(trail);
    } else {
      // Plain text — split on newlines and insert <br /> between lines
      const lines = part.split("\n");
      lines.forEach((line, lineIdx) => {
        result.push(line);
        if (lineIdx < lines.length - 1) {
          result.push(<br key={`${keyPrefix}br-${index}-${lineIdx}`} />);
        }
      });
    }
  });

  return result;
}
