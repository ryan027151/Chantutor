import { ReactNode } from "react";

// Parses question text that contains <b>, <u>, <i> formatting tags and \n newlines.
// Returns an array of React nodes safe to render inside any element.
// Nesting tags (e.g. <b><i>text</i></b>) is not supported — tags must be flat.
export function parseFormattedText(text: string): ReactNode[] {
  if (!text) return [];

  const TAG_REGEX = /(<b>.*?<\/b>|<u>.*?<\/u>|<i>.*?<\/i>)/gs;
  const parts = text.split(TAG_REGEX);
  const result: ReactNode[] = [];

  parts.forEach((part, index) => {
    if (part.startsWith("<b>") && part.endsWith("</b>")) {
      result.push(<strong key={`b-${index}`}>{part.slice(3, -4)}</strong>);
    } else if (part.startsWith("<u>") && part.endsWith("</u>")) {
      result.push(<u key={`u-${index}`}>{part.slice(3, -4)}</u>);
    } else if (part.startsWith("<i>") && part.endsWith("</i>")) {
      result.push(<em key={`i-${index}`}>{part.slice(3, -4)}</em>);
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
