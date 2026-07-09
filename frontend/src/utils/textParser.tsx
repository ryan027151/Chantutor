import { ReactNode } from "react";

// Common HTML entities found in SHSAT question text
const ENTITIES: Record<string, string> = {
  "&amp;":   "&",
  "&lt;":    "<",
  "&gt;":    ">",
  "&nbsp;":  " ",
  "&apos;":  "'",
  "&#39;":   "'",
  "&#x27;":  "'",
  "&quot;":  '"',
  "&#34;":   '"',
  "&mdash;": "—",
  "&ndash;": "–",
  "&lsquo;": "‘",
  "&rsquo;": "’",
  "&ldquo;": "“",
  "&rdquo;": "”",
  "&hellip;": "…",
  "&times;": "×",
  "&divide;": "÷",
  "&plusmn;": "±",
  "&frac12;": "½",
  "&frac14;": "¼",
  "&frac34;": "¾",
};

function decodeEntities(s: string): string {
  return s.replace(/&[a-zA-Z0-9#x]+;/g, (e) => ENTITIES[e] ?? e);
}

// Matches any of the supported inline tags (case-insensitive, dotAll for multi-line content).
// Supported: <b> <strong> <i> <em> <u> <sup> <sub>
const TAG_REGEX = /(<(?:b|strong)>.*?<\/(?:b|strong)>|<(?:i|em)>.*?<\/(?:i|em)>|<u>.*?<\/u>|<sup>.*?<\/sup>|<sub>.*?<\/sub>)/gis;

function innerOf(part: string, open: string, close: string): string {
  return part.slice(open.length, part.toLowerCase().lastIndexOf(close));
}

// Italicizes occurrences of variable letters that are not part of a longer word.
// Uses lookbehind/lookahead so "x" in "3x+2" is matched but "x" in "text" is not.
function applyVarItalics(text: string, variables: string[], keyPrefix: string): ReactNode[] {
  if (!variables.length || !text) return text ? [text] : [];
  const escaped = variables.map(v => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(?<![a-zA-Z])(${escaped.join("|")})(?![a-zA-Z])`, "g");
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    nodes.push(<em key={`${keyPrefix}${m.index}`} className="italic">{m[1]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length > 0 ? nodes : [text];
}

// Parses question / choice text that contains HTML-style formatting tags and entities.
// Handles: <b>/<strong> bold, <i>/<em> italic, <u> underline,
//          <sup> superscript, <sub> subscript, <br>/<br/> line breaks,
//          common HTML entities, and \n newlines.
// Tags may be nested and are matched case-insensitively.
// Pass `variables` (e.g. ["x", "n"]) to italicize those letters wherever they appear.
export function parseFormattedText(raw: string, keyPrefix: string = "", variables: string[] = []): ReactNode[] {
  if (!raw) return [];

  // 1. Decode HTML entities
  // 2. Normalise <br> variants to \n
  // 3. Ensure a space next to inline tags so they don't merge with surrounding words
  const text = decodeEntities(raw)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/(\S)(<(?:b|i|u|strong|em)>)/gi, "$1 $2")
    .replace(/(<\/(?:b|i|u|strong|em)>)([^\s.,;:!?'"\n])/gi, "$1 $2");

  const parts = text.split(TAG_REGEX);
  const result: ReactNode[] = [];

  parts.forEach((part, idx) => {
    const lo = part.toLowerCase();

    if (lo.startsWith("<b>") || lo.startsWith("<strong>")) {
      const closeTag = lo.startsWith("<b>") ? "</b>" : "</strong>";
      const openLen  = lo.startsWith("<b>") ? 3 : 8;
      const inner    = innerOf(part, part.slice(0, openLen), closeTag);
      const lead  = inner.match(/^(\s+)/)?.[1] ?? "";
      const trail = inner.match(/(\s+)$/)?.[1] ?? "";
      if (lead)  result.push(lead);
      result.push(<strong key={`${keyPrefix}b-${idx}`}>{parseFormattedText(inner.trim(), `${keyPrefix}b-${idx}-`, variables)}</strong>);
      if (trail) result.push(trail);

    } else if (lo.startsWith("<i>") || lo.startsWith("<em>")) {
      const closeTag = lo.startsWith("<i>") ? "</i>" : "</em>";
      const openLen  = lo.startsWith("<i>") ? 3 : 4;
      const inner    = innerOf(part, part.slice(0, openLen), closeTag);
      const lead  = inner.match(/^(\s+)/)?.[1] ?? "";
      const trail = inner.match(/(\s+)$/)?.[1] ?? "";
      if (lead)  result.push(lead);
      result.push(<em key={`${keyPrefix}i-${idx}`}>{parseFormattedText(inner.trim(), `${keyPrefix}i-${idx}-`, variables)}</em>);
      if (trail) result.push(trail);

    } else if (lo.startsWith("<u>") && lo.endsWith("</u>")) {
      const inner = part.slice(3, -4);
      const lead  = inner.match(/^(\s+)/)?.[1] ?? "";
      const trail = inner.match(/(\s+)$/)?.[1] ?? "";
      if (lead)  result.push(lead);
      result.push(<u key={`${keyPrefix}u-${idx}`}>{parseFormattedText(inner.trim(), `${keyPrefix}u-${idx}-`, variables)}</u>);
      if (trail) result.push(trail);

    } else if (lo.startsWith("<sup>") && lo.endsWith("</sup>")) {
      const inner = part.slice(5, -6);
      result.push(<sup key={`${keyPrefix}sup-${idx}`}>{parseFormattedText(inner, `${keyPrefix}sup-${idx}-`, variables)}</sup>);

    } else if (lo.startsWith("<sub>") && lo.endsWith("</sub>")) {
      const inner = part.slice(5, -6);
      result.push(<sub key={`${keyPrefix}sub-${idx}`}>{parseFormattedText(inner, `${keyPrefix}sub-${idx}-`, variables)}</sub>);

    } else {
      // Plain text — convert \n to <br />, caret notation to <sup> (e.g. x^2 → x²), italicize variables
      const lines = part.split("\n");
      lines.forEach((line, li) => {
        if (line) {
          const caretRe = /([^\s^]+)\^([^\s^]+)/g;
          let m: RegExpExecArray | null;
          let lastIdx = 0;
          while ((m = caretRe.exec(line)) !== null) {
            if (m.index > lastIdx) result.push(...applyVarItalics(line.slice(lastIdx, m.index), variables, `${keyPrefix}vi-${idx}-${li}-${m.index}-`));
            result.push(<span key={`${keyPrefix}cr-${idx}-${li}-${m.index}`}>{applyVarItalics(m[1], variables, `${keyPrefix}vib-${idx}-${li}-${m.index}-`)}<sup>{m[2]}</sup></span>);
            lastIdx = m.index + m[0].length;
          }
          if (lastIdx < line.length) result.push(...applyVarItalics(line.slice(lastIdx), variables, `${keyPrefix}via-${idx}-${li}-`));
        }
        if (li < lines.length - 1) {
          result.push(<br key={`${keyPrefix}br-${idx}-${li}`} />);
        }
      });
    }
  });

  return result;
}
