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

// Splits raw passage text (from dictionary_of_media.content) into clean paragraphs,
// and wraps inline sentence/paragraph numbers in () when they form a sequential chain.
//
// Pass 1 — paragraph splitting and number normalisation:
//  - Collapses mid-sentence hard line-breaks (PDF/copy-paste artefacts) to spaces.
//  - Splits at \n\n+ (always a boundary) or at \n before a numbered paragraph marker
//    (1-2 digit + Capital+lowercase, e.g. "1 In", "2 Roger") — conservative enough to
//    avoid false splits on "1,500 students", "12 percent", "1 A mile", etc.
//  - Normalises leading paragraph numbers to "(N) " format.
//
// Pass 2 — inline sentence-number wrapping:
//  - After collapsing line-breaks, numbers that WERE on their own lines but started
//    with "I " (pronoun) or other patterns that defeated the split heuristic end up
//    inline (e.g. "... end of sentence. 2 I believe …").
//  - Scans all paragraphs for bare word-boundary numbers before capital letters.
//  - Only wraps them if the collected numbers form a sequential chain with at least
//    two consecutive values (e.g. {1,2} or {2,3,4}). This is the "chain" guard:
//    a lone stray number like "25 years" will never trigger wrapping on its own.
//  - Numbers already wrapped as (N) count toward chain detection but are never
//    double-wrapped.
export function processPassage(raw: string): string[] {
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // ── Pass 1: split + normalise ────────────────────────────────────────────────
  const chunks = text.split(
    /\n{2,}|\n(?=\(?\d{1,2}[.)]\s*["'""']?[A-Z])/
  );
  const paragraphs = chunks
    .map(chunk => {
      let p = chunk.replace(/\n/g, " ").replace(/[ \t]{2,}/g, " ").trim();
      if (!p) return "";
      if (/^\(?\d{1,2}\)?[\s.)]/.test(p)) {
        p = p.replace(/^\(?(\d{1,2})\)?[\s.)]*/, "($1) ");
      }
      return p;
    })
    .filter(Boolean);

  // ── Pass 2: inline sentence-number wrapping ──────────────────────────────────
  // Collect all numbers: already-wrapped (N) AND bare candidates at word boundaries
  // before a capital letter (excludes digit-embedded words like "serial1").
  const nums = new Set<number>();
  for (const p of paragraphs) {
    for (const m of p.matchAll(/\((\d{1,2})\)/g)) nums.add(+m[1]);
    for (const m of p.matchAll(/(?<!\()\b(\d{1,2})\b(?!\))\s+(?=[A-Z])/g)) nums.add(+m[1]);
  }
  const sorted = [...nums].sort((a, b) => a - b);
  // Chain = at least two consecutive integers anywhere in the sorted list
  const isChain = sorted.length >= 2 && sorted.some((n, i) => i > 0 && n === sorted[i - 1] + 1);

  if (!isChain) return paragraphs;

  // Wrap bare inline numbers that are part of the chain (skip already-wrapped ones)
  return paragraphs.map(p =>
    p.replace(/(?<!\()\b(\d{1,2})\b(?!\))(\s+)(?=[A-Z])/g, "($1)$2")
  );
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
