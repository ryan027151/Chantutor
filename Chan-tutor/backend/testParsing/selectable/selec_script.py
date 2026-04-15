"""
SHSAT PDF Question Bank Parser  —  v2
======================================
Improvements over v1
---------------------
1.  Rich text  — bold → <b>text</b>, italic → <i>text</i>, underline → <u>text</u>
    Tags are nestable: bold+italic → <b><i>text</i></b>

2.  Shared-content tagging — passages, tables, and graphs that span multiple
    questions are stored as their own CSV row with uid = [FILE_Qs-Qe_A], e.g.
        uid  = "25A_Q10-Q18_A"
        text = <full formatted passage text>
    Every question that belongs to a shared context is prefixed with its tag:
        "[25A_Q10-Q18_A] In paragraph 1, the author …"
    Explicit "Questions X–Y" hints in the PDF are also honoured.

3.  Choice prefixes — every answer choice starts with its letter label:
        A) The engineers tested foam …
        E) sentence 1

4.  Answer-key separation — pages that contain an answer key are excluded from
    question output and written to a separate file:  result/answer_keys.csv

Usage
-----
    python shsat_parser.py                   # all PDFs in ./pdfs_to_process/
    python shsat_parser.py path/to/file.pdf  # single file
"""

import os, re, csv, sys
from collections import defaultdict
import pdfplumber

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────────────────────────────────────
INPUT_FOLDER   = "pdfs_to_process"
OUTPUT_CSV     = "result/question_bank.csv"
ANS_KEY_CSV    = "result/answer_keys.csv"
MEDIA_CSV      = "result/media_list.csv"
TWO_COL_SPLIT  = 295          # x-pixel boundary between left / right math columns

# ─────────────────────────────────────────────────────────────────────────────
# REGEX
# ─────────────────────────────────────────────────────────────────────────────
ITEM_CODE_RE     = re.compile(
    r'^[A-Z]{2,}\w*_\d+$'       # EWSA17029_2  ER01101812_3  M170522
    r'|^[A-Z]{2,5}\d{4,}\w*$'   # ER0110  ER0236  M060060  (no underscore variant)
)
# PAGE_NUM_ONLY_RE: filters out bare page-number lines (e.g. "49", "80").
# Restricted to the realistic SHSAT page-number range (30–120) so that
# single-digit or two-digit numbers like "4", "5", "13" — which are fraction
# denominators or table values — are NOT incorrectly discarded.
PAGE_NUM_ONLY_RE = re.compile(r'^\s*(?:[3-9]\d|1[01]\d|120)\s*$')
DOUBLED_NOISE_RE = re.compile(r'^\d{1,3}\s+\d{1,3}\s+CONTINUE', re.IGNORECASE)
FORM_NOISE_RE    = re.compile(
    r'^(FORM\s+[A-Z0-9]|CONTINUE\s+ON|CONTINUE\s+TO|THIS\s+IS\s+THE\s+END|'
    r'CONTINUEON|TO\s+THE\s+NEXT|NEXT\s+PAGE|STOP|GO\s+ON|'
    r'PART\s+[12]\s*[—–]|READING\s+COMPREHENSION|REVISING[\./]EDITING|'
    r'GRID.IN|MULTIPLE\s+CHOICE|IMPORTANT\s+NOTES|'
    r'Answer\s+Key|Sample\s+Test)',
    re.IGNORECASE
)
DIRECTIONS_RE    = re.compile(r'^DIRECTIONS?\s*:', re.IGNORECASE)
FORM_NUM_RE      = re.compile(r'^FORM\s+[A-Z]?\s*\d+\s+CONTINUE', re.IGNORECASE)

# "57 QUESTIONS" or "QUESTIONS 1-9 (PART A AND PART B)" — section count headers
SECTION_HDR_RE   = re.compile(
    r'^\d+\s+QUESTIONS?\s*$'
    r'|^QUESTIONS?\s+\d+.*\(PART',
    re.IGNORECASE
)

# Phrases that appear ONLY in exam instructions, never in passage/article content.
# Used exclusively inside detect_shared_contexts to block directions text from
# being mistaken for a passage.
EXAM_INSTRUCTION_RE = re.compile(
    r'marking the\s+\w+\s+answer'
    r'|write in your test booklet'
    r'|reread relevant parts'
    r'|mindful of time'
    r'|follow the conventions of standard written'
    r'|conventions of standard written'
    r'|base your answers only on'
    r'|fill in the circle'
    r'|scrap paper given to you'
    r'|recognize and correct\s+errors'
    r'|improve the writing quality'
    r'|formulas and definitions of mathematical'
    r'|formulas\s+and\s+de\w*\s+\w*\s+of\s+mathematical'
    r'|\(\d+\)\s+formulas'
    r'|in a diagram unless it'
    r'|assume that a diagram is in one plane'
    r'|graphs are drawn to scale'
    r'|reduce\s+.simplify.\s+all\s+fractions'
    r'|diagrams other than graphs are not'
    r'|reduce .simplify. all fractions'
    r'|the content within the text'
    r'|answer the related questions'
    r'|do not leave a box blank'
    r'|do not fill in a circle under an unused'
    r'|in the figure above'
    r'|in the diagram above'
    r'|in the graph above'
    r'|in the table above'
    r'|shown in the figure'
    r'|shown above'
    r'|unless stated otherwise.*assume'
    r'|you can assume relationships according'
    r'|for each grid.in question'
    r'|begin recording your answer'
    r'|leave the negative sign'
    r'|write your answer at the top of the grid'
    r'|start on the left side of each grid'
    r'|lines on a graph that appear to be parallel'
    r'|concurrent lines, straight lines, collinear'
    r'|fi\s*ll\s+in\s+(a\s+)?circle',
    re.IGNORECASE
)
TRAILING_RE      = re.compile(
    r'\s+\d{1,3}\s+\d{1,3}(?:\s+\d{1,3})*\s+(?:CONTINUE\s+)+(?:ON|TO)\b.*$',
    re.IGNORECASE
)
END_OF_TEST_RE   = re.compile(r'\s+IF\s+TIME\s+REMAINS\b.*$', re.IGNORECASE)
ANSWER_KEY_RE    = re.compile(r'answer\s+key', re.IGNORECASE)

CHOICE_RE        = re.compile(r'^([A-H])\.\s+(.*)', re.DOTALL)
Q_NUM_RE         = re.compile(r'^(\d{1,3})\.\s+(.*)|^(\d{1,3})\.\s*$', re.DOTALL)

# "Questions 10–18" or "QUESTIONS 10-57"  (must span ≥ 2 questions)
# Fraction-rendering artifact prefix pattern (compiled once at module level).
# pdfplumber sometimes places fraction numerators/denominators (rendered at
# raised/lowered positions in the PDF) on the same extracted line as the
# following question number.  Examples seen in the wild:
#   "_3 60. A juice mixture…"          (single artifact)
#   "_3 _1 _1 _2 90. If −x = …"        (multiple artifacts)
#   "_1 _1 107. A child grows…"         (multiple artifacts)
# The pattern strips ALL leading "_?N " tokens before a question-number token,
# and handles optional HTML tags (<b>, <i>, …) that may wrap the number.
_FRAC_PREFIX_RE = re.compile(
    r'^(?:_?\d{1,2}\s+)+(?=(?:<[^>]+>)*\d{1,3}\.)'
)

# "Questions 10–18" or "QUESTIONS 10-57"  (must span ≥ 2 questions)
Q_RANGE_RE       = re.compile(r'\bQUESTIONS?\s+(\d+)\s*[–\-—]\s*(\d+)\b', re.IGNORECASE)

# Answer-key row  "1. B"  "58. -0.4"
AK_ROW_RE        = re.compile(r'^\d{1,3}\.\s+\S+$')

# ─────────────────────────────────────────────────────────────────────────────
# MATH TEXT NORMALISER
# ─────────────────────────────────────────────────────────────────────────────

# Patterns applied in order by _clean_math()
_MATH_RULES = [
    # 1. Two consecutive fraction tokens _N _M → "N/M"  (e.g. "_3 _17" → "3/17")
    (re.compile(r'_(\w+)\s+_(\w+)'), r'\1/\2'),
    # 2. Single fraction token _N → "N/?"  (e.g. "_1" → "1/?", "_π" → "π/?")
    #    Must run BEFORE rules 1b/1c so they see "3/?" not "_3".
    (re.compile(r'_(\w+)'), r'\1/?'),
    # 1b. Standalone denominator at end: "3/? 13" → "3/13", "π/? 4" → "π/4"
    #     Safe: won't fire on "1/? cup" or "1/? 1 in." (non-digit or mid-string).
    (re.compile(r'(\w+)/\?\s+(\d{1,3})\s*$'), r'\1/\2'),
    # 1c. Single-letter variable denominator at end: "1/? n" → "1/n"
    (re.compile(r'(\d+)/\?\s+([a-z])\s*$'), r'\1/\2'),
    # 3. Double negative  "− −"  (with optional spaces) → single "−", consume trailing space
    (re.compile(r'[−\-]\s*[−\-]\s*'), '−'),
    # 4. Negative swallowed into paren space: "( digit" → "(−digit"
    (re.compile(r'\(\s+(\d)'), r'(−\1'),
    # 5. Adjacent double absolute-value bars  "| |" → "|"
    (re.compile(r'\|\s+\|'), '|'),
    # 6. Square/blank placeholder
    (re.compile(r'□'), '[?]'),
    # 7. Spurious space before closing paren: "3 )" → "3)"
    (re.compile(r'(\S)\s+\)'), r'\1)'),
    # 8. Operator spacing: add spaces around = ≠ ≤ ≥ ÷ × when touching non-space.
    (re.compile(r'([^\s])([=≠≤≥÷×])'), r'\1 \2'),
    (re.compile(r'([=≠≤≥÷×])([^\s])'), r'\1 \2'),
    # 9. Collapse multiple spaces — must run BEFORE the mixed-number rules so that
    #    the intentional double-space separator they produce is not collapsed again.
    (re.compile(r'  +'), ' '),
    # ── Mixed-number formatting (applied after space-collapse so "  " survives) ──
    # MN1. Reorder "NUM/? WHOLE DENOM" at end → "WHOLE  NUM/DENOM"
    #      e.g. "5/? 3 6" → "3  5/6"
    (re.compile(r'(\d+)/\?\s+(\d{1,2})\s+(\d{1,2})\s*$'), r'\2  \1/\3'),
    # MN3. Reorder "NUM/? WHOLE UNIT DENOM" at end → "WHOLE  NUM/DENOM UNIT"
    #      e.g. "1/? 1 in. 5" → "1  1/5 in."
    (re.compile(r'(\d+)/\?\s+(\d{1,2})\s+([a-zA-Z][a-zA-Z\.]*)\s+(\d{1,2})\s*$'), r'\2  \1/\4 \3'),
    # MN2. Reorder "NUM/? UNIT DENOM" at end → "NUM/DENOM UNIT"
    #      e.g. "1/? cup 8" → "1/8 cup"
    (re.compile(r'(\d+)/\?\s+([a-zA-Z][a-zA-Z\.]*)\s+(\d{1,2})\s*$'), r'\1/\3 \2'),
    # SPACE. Ensure two spaces between whole number and adjacent fraction
    #        "2 11/?" → "2  11/?",  "3 5/6" → "3  5/6"
    #        Lookbehind prevents firing on denominators like the "4" in "3/4".
    (re.compile(r'(?<![/\w])(\d+) (?! )(\d+/(?:\d+|\?))'), r'\1  \2'),
]


def _clean_math(text: str) -> str:
    """Apply normalisation rules to a plain-text math expression."""
    for pat, repl in _MATH_RULES:
        text = pat.sub(repl, text)
    return text.strip()


def _clean_math_html(text: str) -> str:
    """
    Apply math normalisation to *text* while leaving HTML tags untouched.
    Only segments between tags are cleaned; tag attributes are never modified.
    """
    if not text:
        return text
    # Split on HTML tags; odd-indexed parts are tags, even-indexed are text nodes.
    parts = re.split(r'(<[^>]+>)', text)
    return ''.join(
        part if part.startswith('<') else _clean_math(part)
        for part in parts
    )


# Bold choice label as it appears in math PDFs: <b>A.</b> or <b>E.</b>
BOLD_CHOICE_RE   = re.compile(r'<b>([A-H])\.</b>')

# Plain (non-bold) choice label that still appears at end-of-segment:
# e.g.  "−18 F."  or  "_π A."  — the VALUE comes BEFORE the label
# Pattern: optional non-alpha prefix, whitespace, single letter, period, end-or-space
PLAIN_CHOICE_TRAIL_RE = re.compile(
    r'(.*?)\s+([A-H])\.\s*$', re.DOTALL
)

# Trailing PDF item-code noise on the last choice / question text
# e.g. "M990025_3", "M060060_1", "ER01101812_3"
# Also catches "500 M990025_3" where the code follows a numeric answer
ITEM_CODE_TRAIL  = re.compile(r'\s+[A-Z]{1,5}\d{4,}\w*(?:\s+.*)?$')

# Trailing fraction-component tokens before a bold choice label.
# The underscore is REQUIRED (not optional) so that plain number sequences
# like "0 1 2 3 4 5 6 7" (number-line labels) are NOT mistakenly treated
# as fraction prefixes.  Only pdfplumber-raised-position artefacts carry "_".
_FRAC_TRAIL_RE   = re.compile(r'(\s+_\d{1,2})+\s*$')

# Non-digit/letter prefix before a bold choice label: "_π <b>A.</b>"
_NON_ALPHA_TRAIL_RE = re.compile(r'\s+\S+\s*$')




# ─────────────────────────────────────────────────────────────────────────────
# FONT / FORMATTING HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _font_flags(fontname: str):
    """Return (is_bold, is_italic) from a PDF font name string."""
    fn = (fontname or '').lower()
    bold   = ('bold'  in fn or '-bd' in fn or 'heavy' in fn or
              'demi'  in fn or fn.endswith('-b'))
    italic = ('italic' in fn or 'oblique' in fn or '-it' in fn or
              '-sl'    in fn or fn.endswith('-i'))
    return bold, italic


def _underline_segs(page):
    """
    Return list of (x0, x1, y_mid) for thin horizontal strokes that indicate
    underlines.  Ignores full-page-width dividers and vertical lines.
    """
    segs = []
    page_w = page.width

    def _add(x0, x1, y0, y1):
        h = abs(y1 - y0)
        w = abs(x1 - x0)
        if h < 2 and 6 < w < page_w * 0.95:
            segs.append((min(x0, x1), max(x0, x1), (y0 + y1) / 2))

    for ln in (page.lines or []):
        _add(ln['x0'], ln['x1'],
             ln.get('top', ln.get('y0', 0)),
             ln.get('bottom', ln.get('y1', 0)))
    for r in (page.rects or []):
        if r.get('height', 99) < 2:
            _add(r['x0'], r['x1'],
                 r.get('top', r.get('y0', 0)),
                 r.get('bottom', r.get('y1', 0)))
    return segs


def _word_formatting(word, page_chars, ul_segs):
    """
    Determine (bold, italic, underline) for a single word dict from
    extract_words() by inspecting its underlying characters.
    """
    wx0, wx1 = word['x0'], word['x1']
    wt,  wb  = word['top'], word['bottom']

    chars = [c for c in page_chars
             if c.get('text', '').strip()
             and wx0 - 2 <= c['x0'] <= wx1 + 2
             and wt  - 2 <= c['top'] <= wb  + 2]
    if not chars:
        return False, False, False

    n   = len(chars)
    bc  = sum(1 for c in chars if _font_flags(c.get('fontname', ''))[0])
    ic  = sum(1 for c in chars if _font_flags(c.get('fontname', ''))[1])
    bold   = bc > n / 2
    italic = ic > n / 2

    # Underline: a matching horizontal stroke must be within ~4 px of text bottom
    under = any(
        ux0 <= wx1 + 2 and ux1 >= wx0 - 2 and abs(uy - wb) < 4
        for ux0, ux1, uy in ul_segs
    )
    return bold, italic, under


def _wrap(text: str, bold: bool, italic: bool, underline: bool) -> str:
    """Apply HTML-like formatting tags (innermost = underline, outermost = bold)."""
    if not text or not (bold or italic or underline):
        return text
    r = text
    if underline: r = f'<u>{r}</u>'
    if italic:    r = f'<i>{r}</i>'
    if bold:      r = f'<b>{r}</b>'
    return r


def _strip_tags(text: str) -> str:
    """Remove all HTML-like tags to get raw text for length comparisons."""
    return re.sub(r'<[^>]+>', '', text)


# ─────────────────────────────────────────────────────────────────────────────
# NOISE FILTERING
# ─────────────────────────────────────────────────────────────────────────────

def _is_noise(s: str) -> bool:
    s = s.strip()
    if not s:                                        return True
    if ITEM_CODE_RE.match(s):                        return True
    if FORM_NOISE_RE.match(s):                       return True
    if PAGE_NUM_ONLY_RE.match(s):                    return True
    if DIRECTIONS_RE.match(s):                       return True
    if FORM_NUM_RE.match(s):                         return True
    if SECTION_HDR_RE.match(s):                      return True
    if re.match(r'^FORM\s+[A-Z]\s+\d+\s*$', s):     return True
    if re.match(r'^\d{1,3}\s+CONTINUE', s, re.I):   return True
    if DOUBLED_NOISE_RE.match(s):                    return True
    return False


def _doubled_encoded(word: str) -> bool:
    if len(word) < 4:
        return False
    i, pairs = 0, 0
    while i < len(word) - 1:
        if word[i] == word[i + 1]:
            pairs += 1; i += 2
        else:
            return False
    return pairs >= 2


def _is_page_num(w: str) -> bool:
    try:    return 30 <= int(w) <= 120
    except: return False


def _filter_directions(line_pairs):
    """
    Remove DIRECTIONS: header lines and every continuation sentence that
    follows them.  A directions block ends at the first numbered question,
    answer-choice line, blank line, or noise line — whichever comes first.
    """
    out    = []
    in_dir = False
    for fmt, raw in line_pairs:
        r = raw.strip()
        if DIRECTIONS_RE.match(r):
            in_dir = True      # start of block — skip this line
            continue
        if in_dir:
            # End the block when we hit real content (question / choice) or nothing
            if Q_NUM_RE.match(r) or CHOICE_RE.match(r) or not r or _is_noise(r):
                in_dir = False
                if r and not _is_noise(r):
                    out.append((fmt, raw))   # real content — keep it
            # else: still inside directions — skip
            continue
        out.append((fmt, raw))
    return out


def clean_trailing_noise(text: str) -> str:
    """Strip page-continuation footers from the end of extracted text."""
    text = TRAILING_RE.sub('', text).strip()
    text = END_OF_TEST_RE.sub('', text).strip()
    words = text.split(' ')
    cut = None
    for i, w in enumerate(words):
        if _doubled_encoded(w):
            s = i
            while s > 0 and _is_page_num(words[s - 1]):
                s -= 1
            if s > 0:
                cut = s
            break
    if cut is not None:
        text = ' '.join(words[:cut]).strip()
    return text


# ─────────────────────────────────────────────────────────────────────────────
# FORMATTED LINE EXTRACTION
# ─────────────────────────────────────────────────────────────────────────────

def _words_to_fmt_lines(word_list, page_chars, ul_segs, y_tol=4):
    """
    Convert a list of pdfplumber word dicts to
    [(y_top, formatted_text, raw_text), …].

    Adjacent words with identical (bold, italic, underline) are merged into
    a single span before wrapping, so we get e.g.
        <b>The engineers tested</b> foam and fiberglass
    rather than
        <b>The</b> <b>engineers</b> <b>tested</b> …
    """
    if not word_list:
        return []

    annotated = []
    for w in word_list:
        b, i, u = _word_formatting(w, page_chars, ul_segs)
        annotated.append({**w, '_b': b, '_i': i, '_u': u})

    sorted_w = sorted(annotated,
                      key=lambda w: (round(w['top'] / y_tol) * y_tol, w['x0']))
    lines, cur, cur_y = [], [], None

    def _flush():
        if not cur:
            return
        fparts, rparts = [], []
        st = cur[0]['text']
        sb, si, su = cur[0]['_b'], cur[0]['_i'], cur[0]['_u']
        for w in cur[1:]:
            if w['_b'] == sb and w['_i'] == si and w['_u'] == su:
                st += ' ' + w['text']
            else:
                fparts.append(_wrap(st, sb, si, su))
                rparts.append(st)
                st, sb, si, su = w['text'], w['_b'], w['_i'], w['_u']
        fparts.append(_wrap(st, sb, si, su))
        rparts.append(st)
        lines.append((cur[0]['top'], ' '.join(fparts), ' '.join(rparts)))

    for w in sorted_w:
        wy = round(w['top'] / y_tol) * y_tol
        if cur_y is None or abs(wy - cur_y) <= y_tol * 2:
            cur.append(w)
            if cur_y is None:
                cur_y = wy
        else:
            _flush()
            cur, cur_y = [w], wy
    _flush()
    return lines


def extract_page_columns(page):
    """
    Returns (left_lines, right_lines) where each is a list of
    (y_top, formatted_text, raw_text) after noise filtering.
    right_lines is empty for single-column (ELA) pages.
    """
    words = page.extract_words(keep_blank_chars=False, x_tolerance=3, y_tolerance=3)
    if not words:
        return [], []

    page_chars = page.chars or []
    ul_segs    = _underline_segs(page)

    q_tokens   = [w for w in words if re.match(r'^\d{1,3}\.$', w['text'])]
    is_two_col = any(w['x0'] >= TWO_COL_SPLIT for w in q_tokens)

    if not is_two_col:
        all_lines = _words_to_fmt_lines(words, page_chars, ul_segs)
        return [(y, f, r) for y, f, r in all_lines if not _is_noise(r)], []

    lw = [w for w in words if w['x0'] <  TWO_COL_SPLIT]
    rw = [w for w in words if w['x0'] >= TWO_COL_SPLIT]
    ll = _words_to_fmt_lines(lw, page_chars, ul_segs)
    rl = _words_to_fmt_lines(rw, page_chars, ul_segs)
    return ([(y, f, r) for y, f, r in ll if not _is_noise(r)],
            [(y, f, r) for y, f, r in rl if not _is_noise(r)])


# ─────────────────────────────────────────────────────────────────────────────
# MEDIA DETECTION
# ─────────────────────────────────────────────────────────────────────────────

def detect_media_objects(page):
    """
    Detect visual media (diagrams, graphs, data tables) on a page.
    Returns list of {'y0', 'y1', 'x_center', 'type'}.
    """
    page_w, page_h = page.width, page.height
    found = []

    # 1. Data tables
    try:
        for ft in page.find_tables():
            if len(ft.rows) < 2:
                continue
            try:
                data = ft.extract()
                non_empty = sum(1 for row in data for cell in row if cell and cell.strip())
                if non_empty < 3:
                    continue
            except Exception:
                pass
            bx0, by0, bx1, by1 = ft.bbox
            found.append({'y0': by0, 'y1': by1, 'x0': bx0, 'x1': bx1,
                          'x_center': (bx0 + bx1) / 2, 'type': 'table'})
    except Exception:
        pass

    # 2. Embedded raster images
    seen_img = set()
    for img in page.images:
        w = img['x1'] - img['x0']
        h = img['y1'] - img['y0']
        if w < 50 or h < 50:
            continue
        key = (round(img['x0']), round(img['y0']))
        if key in seen_img:
            continue
        seen_img.add(key)
        if w < 100 and h > 120:
            continue
        found.append({'y0': img['y0'], 'y1': img['y1'],
                      'x0': img['x0'], 'x1': img['x1'],
                      'x_center': (img['x0'] + img['x1']) / 2, 'type': 'image'})

    # 3. Rect-based diagram frames
    for r in page.rects:
        w, h = r['width'], r['height']
        if w > page_w * 0.85 or h > page_h * 0.85:
            continue
        if w > 350 or w < 30 or h < 25:
            continue
        try:
            txt = (page.crop((r['x0'], r['y0'], r['x1'], r['y1'])).extract_text() or '').strip()
        except Exception:
            txt = ''
        if w > 200 and len(txt.split()) > 10:
            continue
        found.append({'y0': r['y0'], 'y1': r['y1'],
                      'x0': r['x0'], 'x1': r['x1'],
                      'x_center': (r['x0'] + r['x1']) / 2, 'type': 'rect'})

    # 4. Curve / line clusters  (geometric diagrams, coordinate graphs)
    graphic_items = []
    for c in page.curves:
        if c['height'] > 15 and c['width'] > 15:
            graphic_items.append({'y0': c['y0'], 'y1': c['y1'],
                                   'x0': c['x0'], 'x1': c['x1']})
    for ln in page.lines:
        dx   = abs(ln['x1'] - ln['x0'])
        dy   = abs(ln['y1'] - ln['y0'])
        span = max(dx, dy)
        if dx > page_w * 0.7:            continue
        if span < 30:                    continue
        if dx < 5 and dy > page_h * 0.25: continue
        graphic_items.append({'y0': ln['y0'], 'y1': ln['y1'],
                               'x0': ln['x0'], 'x1': ln['x1']})

    if graphic_items:
        for col_min, col_max in [(0, TWO_COL_SPLIT), (TWO_COL_SPLIT, page_w)]:
            col_items = [g for g in graphic_items
                         if col_min <= (g['x0'] + g['x1']) / 2 < col_max]
            if not col_items:
                continue
            clusters = []
            for g in sorted(col_items, key=lambda x: x['y0']):
                merged = False
                for cl in clusters:
                    if g['y0'] < cl['y1'] + 80:
                        cl['y0'] = min(cl['y0'], g['y0'])
                        cl['y1'] = max(cl['y1'], g['y1'])
                        cl['x0'] = min(cl['x0'], g['x0'])
                        cl['x1'] = max(cl['x1'], g['x1'])
                        cl['count'] += 1
                        merged = True
                        break
                if not merged:
                    clusters.append({'y0': g['y0'], 'y1': g['y1'],
                                     'x0': g['x0'], 'x1': g['x1'], 'count': 1})
            for cl in clusters:
                span = cl['y1'] - cl['y0']
                if not ((cl['count'] >= 2 and span > 40) or
                        (cl['count'] >= 1 and span > 80)):
                    continue
                if cl['y0'] < 30 or cl['y0'] > page_h - 30:
                    continue
                found.append({'y0': cl['y0'], 'y1': cl['y1'],
                              'x0': cl['x0'], 'x1': cl['x1'],
                              'x_center': (cl['x0'] + cl['x1']) / 2, 'type': 'graphic'})

    # Column-aware de-duplication
    result = []
    for item in sorted(found, key=lambda x: x['y0']):
        overlap = False
        for ex in result:
            if abs(item['x_center'] - ex['x_center']) > 200:
                continue
            oy0 = max(item['y0'], ex['y0'])
            oy1 = min(item['y1'], ex['y1'])
            if oy1 > oy0:
                item_h = max(item['y1'] - item['y0'], 1)
                if (oy1 - oy0) / item_h > 0.5:
                    overlap = True
                    break
        if not overlap:
            result.append(item)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# QUESTION POSITION INDEX  (used for media assignment)
# ─────────────────────────────────────────────────────────────────────────────

def build_question_position_index(pdf):
    page_q_pos, all_q_order = {}, []
    for pn, page in enumerate(pdf.pages):
        if ANSWER_KEY_RE.search(page.extract_text() or ''):
            continue
        words   = page.extract_words(keep_blank_chars=False, x_tolerance=3, y_tolerance=3)
        entries = []
        for w in words:
            if not re.match(r'^\d{1,3}\.$', w['text']):
                continue
            try:
                qn = int(w['text'].rstrip('.'))
            except ValueError:
                continue
            x = w['x0']
            if not (x < 130 or (295 <= x < 400)):
                continue
            col = 'right' if x >= TWO_COL_SPLIT else 'left'
            entries.append({'q_num': qn, 'y': w['top'], 'x': x, 'col': col})
            all_q_order.append((pn, qn, w['top']))
        if entries:
            page_q_pos[pn] = entries
    all_q_order.sort(key=lambda x: (x[0], x[2]))
    return page_q_pos, all_q_order


def assign_media_to_questions(page_media_map, page_q_pos, all_q_order,
                              claimed_media=None):
    """
    Assign unclaimed media objects to their nearest question.
    claimed_media: set of (page_num, media_idx) already assigned to a range element.

    Returns
    -------
    q_media_count : {q_num: int}   — number of per-question media items
    q_media_assign: {(pn, mi): (q_num, per_q_idx)}  — detailed assignment map
    """
    if claimed_media is None:
        claimed_media = set()
    q_media_count  = defaultdict(int)
    q_media_assign = {}                       # (pn, mi) → (q_num, per_q_idx)

    for pn, media_list in page_media_map.items():
        q_on_page  = page_q_pos.get(pn, [])
        is_two_col = any(q['col'] == 'right' for q in q_on_page)
        for mi, media in enumerate(media_list):
            if (pn, mi) in claimed_media:
                continue
            med_y   = (media['y0'] + media['y1']) / 2
            med_xc  = media['x_center']
            med_col = 'right' if med_xc >= TWO_COL_SPLIT else 'left'
            aq = None
            if q_on_page:
                cands = ([q for q in q_on_page if q['col'] == med_col]
                         if is_two_col else q_on_page) or q_on_page
                above = [q for q in cands if q['y'] <= med_y + 60]
                aq = (max(above, key=lambda q: q['y']) if above
                      else min(cands, key=lambda q: q['y']))
            else:
                for ppn, qn, _ in all_q_order:
                    if ppn > pn:
                        aq = {'q_num': qn}
                        break
            if aq:
                per_idx = q_media_count[aq['q_num']]
                q_media_count[aq['q_num']] += 1
                q_media_assign[(pn, mi)] = (aq['q_num'], per_idx)

    return q_media_count, q_media_assign


# ─────────────────────────────────────────────────────────────────────────────
# SHARED CONTEXT — PASSAGE / TABLE / GRAPH DETECTION
# ─────────────────────────────────────────────────────────────────────────────

def _is_passage_noise(raw: str) -> bool:
    """
    Stricter noise check used ONLY when deciding whether accumulated text lines
    form a real passage.  Catches test-taking directions that survive _is_noise()
    because they don't appear on their own line but are part of a multi-line block.
    """
    if _is_noise(raw):
        return True
    if EXAM_INSTRUCTION_RE.search(raw):
        return True
    # Item-code labels that appear inline:  "ER0110"  "M170522"
    if re.match(r'^[A-Z]{2,5}\d{4,}\w*$', raw.strip()):
        return True
    return False


# Minimum requirements for a block to count as a shared passage
_MIN_PASSAGE_LINES   = 3
_MIN_LINE_CHARS      = 30
_MIN_CONTEXT_SPAN    = 4   # must span ≥ this many questions
# Media taller than this (px) on a passage page is treated as a range element
# (e.g. a reference table).  Smaller media stays per-question.
_RANGE_MEDIA_MIN_H   = 60


def detect_passage_ranges(flat_pairs):
    """
    Scan the flat (fmt, raw) line stream and identify question ranges that share
    a common passage / reference material.

    Returns a list of raw range dicts — NO tags or letters yet:
        [{'q_start': int, 'q_end': int, 'text': str}, …]

    Tagging (letters A, B, C… per range) is done later in build_range_elements,
    once we know how many distinct elements each range has.
    """
    # ── Build event stream ────────────────────────────────────────────────────
    events = []
    for fmt, raw in flat_pairs:
        r = raw.strip()
        if not r or _is_noise(r):
            continue
        mq = Q_NUM_RE.match(r)
        if mq:
            events.append(('q', int(mq.group(1) or mq.group(3)), fmt, r))
            continue
        mc = CHOICE_RE.match(r)
        if mc:
            events.append(('c', None, fmt, r))
            continue
        mr = Q_RANGE_RE.search(r)
        if mr:
            qs, qe = int(mr.group(1)), int(mr.group(2))
            if qe > qs and (qe - qs) >= 2:
                events.append(('range', (qs, qe), fmt, r))
                continue
        events.append(('t', None, fmt, r))

    if not events:
        return []

    raw_ranges = []   # {q_start, q_end, text}
    pending    = []   # blocks without explicit q_end yet

    i = 0
    while i < len(events):
        etype = events[i][0]

        # ── Explicit "Questions X–Y" hint ─────────────────────────────────────
        if etype == 'range':
            qs, qe = events[i][1]
            blk = []
            k = i - 1
            while k >= 0 and events[k][0] == 't':
                if not _is_passage_noise(events[k][3]):
                    blk.insert(0, events[k][2])
                k -= 1
            j = i + 1
            while j < len(events) and events[j][0] == 't':
                if not _is_passage_noise(events[j][3]):
                    blk.append(events[j][2])
                j += 1
            if blk:
                raw_ranges.append({'q_start': qs, 'q_end': qe,
                                    'text': ' '.join(blk).strip()})
            i += 1
            continue

        # ── Implicit text block ────────────────────────────────────────────────
        if etype == 't':
            blk = []
            while i < len(events) and events[i][0] == 't':
                rv = events[i][3]
                if len(rv) >= _MIN_LINE_CHARS and not _is_passage_noise(rv):
                    blk.append(events[i][2])
                i += 1
            if len(blk) >= _MIN_PASSAGE_LINES:
                nq = next((events[j][1] for j in range(i, len(events))
                            if events[j][0] == 'q'), None)
                if nq is not None:
                    pending.append({'q_start': nq, 'lines': blk})
            continue

        i += 1

    # ── Assign q_end to pending blocks ────────────────────────────────────────
    pending.sort(key=lambda c: c['q_start'])
    all_q_nums = sorted({e[1] for e in events if e[0] == 'q'})

    for idx, ctx in enumerate(pending):
        ctx['q_end'] = (pending[idx + 1]['q_start'] - 1
                        if idx + 1 < len(pending)
                        else (max(all_q_nums) if all_q_nums else ctx['q_start']))
        if ctx['q_end'] - ctx['q_start'] + 1 < _MIN_CONTEXT_SPAN:
            continue
        raw_ranges.append({'q_start': ctx['q_start'],
                            'q_end':   ctx['q_end'],
                            'text':    ' '.join(ctx['lines']).strip()})

    # ── Post-processing filter 1: remove proper super-ranges ─────────────────
    # If range A fully contains range B (with at least one strict boundary),
    # drop A — it is a detection artefact caused by text leaking across passage
    # boundaries (e.g. a stray final sentence from the previous passage creates
    # an artificial block that spans the entire remaining document).
    raw_ranges = [
        r for r in raw_ranges
        if not any(
            (o['q_start'] >= r['q_start'] and o['q_end'] <= r['q_end']
             and (o['q_start'] > r['q_start'] or o['q_end'] < r['q_end']))
            for o in raw_ranges if o is not r
        )
    ]

    # ── Post-processing filter 2: minimum prose sentence count ────────────────
    # A genuine shared passage has many complete sentences.
    # Math problem fragments that slip through (1-3 sentences) are eliminated.
    # Count sentence-boundary periods only: ". " (period + whitespace).
    # This excludes decimal points ("3.14") and end-of-string periods,
    # so short math problem fragments (few real sentences) are rejected
    # while genuine passages (many full sentences) are kept.
    _MIN_PROSE_PUNCTS = 5
    raw_ranges = [
        r for r in raw_ranges
        if len(re.findall(r'\.\s',
                          re.sub(r'<[^>]+>', '', r['text']))) >= _MIN_PROSE_PUNCTS
    ]

    return raw_ranges


def build_range_elements(raw_ranges, page_media_map, page_q_pos, filename):
    """
    For each question range (q_start, q_end) assign letters A, B, C… to its
    distinct elements:

        A  →  passage / article text  (if any)
        B  →  first substantial media object on the range's pages (table, graph…)
        C  →  second substantial media object, etc.

    The letters RESET for every new range, so:
        25A_Q28-Q34_A  =  passage
        25A_Q28-Q34_B  =  timing table

    Returns
    -------
    tagged_elements : list of {tag, q_start, q_end, text}
        One entry per element; these become CSV rows.
    claimed_media   : set of (page_num, media_idx)
        Media objects already tagged as range elements — excluded from the
        per-question media_refs counter.
    range_media_assign : dict  (page_num, media_idx) → tag_uid  e.g. "25A_Q51-Q57_B"
        Detailed assignment for media_list.csv output.
    """
    # question → page mapping
    q_to_pages = defaultdict(set)
    for pn, entries in page_q_pos.items():
        for e in entries:
            q_to_pages[e['q_num']].add(pn)

    tagged_elements    = []
    claimed_media      = set()
    range_media_assign = {}   # (pn, mi) → tag_uid

    for rng in raw_ranges:
        qs, qe    = rng['q_start'], rng['q_end']
        elem_list = []   # ordered A, B, C…
        elem_keys = []   # parallel list: None (text elem) or (pn, mi) for media

        # ── Element A: passage text ────────────────────────────────────────────
        if rng['text'].strip():
            elem_list.append(rng['text'])
            elem_keys.append(None)

        # ── Find pages covered by this range ──────────────────────────────────
        pages_in_range = set()
        for qn in range(qs, qe + 1):
            pages_in_range |= q_to_pages.get(qn, set())

        # ── Elements B, C…: substantial media on those pages ──────────────────
        for pn in sorted(pages_in_range):
            for mi, med in enumerate(page_media_map.get(pn, [])):
                key = (pn, mi)
                if key in claimed_media:
                    continue
                h = med['y1'] - med['y0']
                if h >= _RANGE_MEDIA_MIN_H and med['type'] in ('table', 'image', 'graphic'):
                    elem_list.append(f"[{med['type'].upper()}]")
                    elem_keys.append(key)
                    claimed_media.add(key)

        # ── Assign letters within this range ──────────────────────────────────
        first_page = (min(pages_in_range) + 1) if pages_in_range else 0  # 1-indexed

        for idx, (elem_text, elem_key) in enumerate(zip(elem_list, elem_keys)):
            letter  = chr(65 + idx)
            tag_uid = f"{filename}_Q{qs}-Q{qe}_{letter}"
            tagged_elements.append({
                'tag':        tag_uid,
                'q_start':    qs,
                'q_end':      qe,
                'text':       elem_text,
                'first_page': first_page,
            })
            if elem_key is not None:
                range_media_assign[elem_key] = tag_uid

    return tagged_elements, claimed_media, range_media_assign


# keep old name as an alias used by process_pdf (thin wrapper)
def detect_shared_contexts(flat_pairs, filename):
    """Delegates to detect_passage_ranges; letters are now assigned by build_range_elements."""
    return detect_passage_ranges(flat_pairs)


# ─────────────────────────────────────────────────────────────────────────────
# BOLD-CHOICE RESCUE
# ─────────────────────────────────────────────────────────────────────────────

def _extract_bold_choices(source: str):
    """
    Many math questions have their answer choices formatted as  <b>A.</b> text
    rather than the plain  "A. text"  that CHOICE_RE expects.  pdfplumber
    therefore cannot split them out and they end up merged into the question
    text (or into a previous choice's text).

    This function finds every  <b>[A-H].</b>  marker in *source* and splits
    the string into (pre_text, {letter: 'L) body'}) where:

      pre_text  — everything before the first choice marker (the question stem)
      dict      — one entry per found letter, value already prefixed "L) …"

    Fraction artefact tokens (_N) that appear IMMEDIATELY before a bold marker
    belong to THAT choice (they are the leading numerator of a fraction in the
    choice body), so they are moved into the choice rather than left in the
    preceding segment.

    Trailing PDF item-code labels (M[digits]+) are stripped from the last segment.

    Returns (source, {}) unchanged when no bold markers are found.
    """
    markers = list(BOLD_CHOICE_RE.finditer(source))
    if not markers:
        return source, {}

    new_choices = {}

    # ── Clean-text boundary ────────────────────────────────────────────────────
    # Everything before the first marker, minus any trailing tokens
    # that logically belong to choice A/E (fraction _N or symbol like _π).
    pre = source[:markers[0].start()]
    # First try fraction-digit trail
    frac_m = _FRAC_TRAIL_RE.search(pre)
    if frac_m:
        first_prefix = pre[frac_m.start():].strip()
        pre_text = pre[:frac_m.start()].strip()
    else:
        # Try generic trailing token (e.g. "_π" before <b>A.</b>)
        gen_m = _NON_ALPHA_TRAIL_RE.search(pre)
        # Only use it if it looks like a math symbol / fraction prefix (starts with _)
        if gen_m and pre[gen_m.start():].strip().startswith('_'):
            first_prefix = pre[gen_m.start():].strip()
            pre_text = pre[:gen_m.start()].strip()
        else:
            first_prefix = ''
            pre_text = pre.strip()

    # Strip trailing item-code from pre_text too
    pre_text = ITEM_CODE_TRAIL.sub('', pre_text).strip()

    # ── Extract each choice body ───────────────────────────────────────────────
    for idx, marker in enumerate(markers):
        letter = marker.group(1)
        seg_start = marker.end()
        seg_end   = markers[idx + 1].start() if idx + 1 < len(markers) else len(source)
        segment   = source[seg_start:seg_end]

        # Fraction tokens at the END of this segment belong to the NEXT choice.
        # Collect them now (they'll be prepended when idx+1 is processed).
        frac_trail = _FRAC_TRAIL_RE.search(segment)
        if frac_trail and idx + 1 < len(markers):
            body = segment[:frac_trail.start()].strip()
            # next_prefix will be picked up when idx+1 runs (see below)
        else:
            body = segment.strip()
            # Strip trailing item codes from the last choice segment
            body = ITEM_CODE_TRAIL.sub('', body).strip()

        # Prepend fraction prefix that trailed from the previous segment
        if idx == 0:
            leader = first_prefix
        else:
            prev_seg = source[markers[idx - 1].end() : marker.start()]
            pm = _FRAC_TRAIL_RE.search(prev_seg)
            leader = pm.group(0).strip() if pm else ''

        if leader:
            body = leader + (' ' + body if body else '')

        if body:
            new_choices[letter] = f"{letter}) {body}"

    return pre_text, new_choices


def _rescue_choices(q_text: str, choices: dict) -> tuple:
    """
    Run bold-choice rescue on both the question text AND on each existing
    choice value (handles cases where G/H leaked into F's text).
    Also handles the "value-before-label" pattern: −18 <b>F.</b>
    where the value belonging to F appears at the end of E's choice text.

    Returns (clean_text, updated_choices).
    """
    # 1. Rescue from question text
    clean_text, from_text = _extract_bold_choices(q_text)
    for letter, val in from_text.items():
        if letter not in choices or not _strip_tags(choices[letter]).strip():
            choices[letter] = val

    # 2. Rescue from each existing choice value (handles G/H in F's text)
    for letter in sorted(choices.keys()):
        val = choices[letter]
        body = re.sub(r'^[A-H]\)\s*', '', val)
        _, from_choice = _extract_bold_choices(body)
        if from_choice:
            new_pre, _ = _extract_bold_choices(body)
            choices[letter] = f"{letter}) {new_pre}" if new_pre.strip() else ''
            for sub_letter, sub_val in from_choice.items():
                if sub_letter not in choices or not _strip_tags(choices[sub_letter]).strip():
                    choices[sub_letter] = sub_val

    # 3. Value-before-label rescue: "−18 <b>F.</b>" means −18 belongs to F,
    #    but it was appended as a continuation of E's text.
    #    Pattern: choice body ends with  <optional_space> <value> <b>L.</b>
    VBL_RE = re.compile(r'^(.*?)\s+(\S+)\s+<b>([A-H])\.</b>\s*$', re.DOTALL)
    for letter in sorted(choices.keys()):
        val = choices[letter]
        prefix = re.match(r'^([A-H]\) )', val)
        if not prefix:
            continue
        body = val[prefix.end():]
        m = VBL_RE.match(body)
        if m:
            clean_body, value_part, next_letter = m.group(1), m.group(2), m.group(3)
            # Fix the current choice (remove the trailing value+label)
            choices[letter] = f"{letter}) {clean_body}".strip()
            # The value_part is the answer for next_letter
            if next_letter not in choices or not _strip_tags(choices[next_letter]).strip():
                choices[next_letter] = f"{next_letter}) {value_part}"

    # 4. Strip trailing item-code noise from every choice
    for letter in list(choices.keys()):
        if choices[letter]:
            pfx = re.match(r'^([A-H]\) )', choices[letter])
            p   = pfx.group(1) if pfx else ''
            b   = choices[letter][len(p):]
            b   = ITEM_CODE_TRAIL.sub('', b).strip()
            # Also strip trailing "□ 2y y _ _ _" type bleed-over from next question
            b   = re.sub(r'\s+□.*$', '', b).strip()
            choices[letter] = p + b if b else ''
        if not choices[letter]:
            del choices[letter]

    return clean_text, choices


# ─────────────────────────────────────────────────────────────────────────────
# QUESTION TEXT PARSER
# ─────────────────────────────────────────────────────────────────────────────

def parse_questions_from_lines(line_pairs, filename, range_elements):
    """
    Parse (formatted_text, raw_text) pairs into question dicts.

    range_elements : flat list of {tag, q_start, q_end, text} from build_range_elements.
        For each question the parser finds all elements covering it, picks the most
        specific range (smallest span), then prefixes the question text with ALL tags
        from that range — e.g.:
            "[25A_Q28-Q34_A] [25A_Q28-Q34_B] Which statement best describes…"
        so the reader knows exactly which passage AND which table to consult.

    Answer choices are prefixed with their letter:  "A) …"  "E) …"
    """
    questions = []
    st = {'q': None, 'choice': None}

    def _finalize_choice():
        if st['choice'] and st['q']:
            val = clean_trailing_noise(st['q']['choices'][st['choice']])
            val = ITEM_CODE_TRAIL.sub('', val).strip()
            st['q']['choices'][st['choice']] = val
        st['choice'] = None

    def _save_q():
        if not st['q']:
            return
        qnum     = st['q']['q_num']
        fmt_text = clean_trailing_noise(' '.join(st['q']['text_parts']).strip())
        # Strip trailing item-code labels (e.g. "M990025_3") from question text
        fmt_text = ITEM_CODE_TRAIL.sub('', fmt_text).strip()

        # ── Rescue choices embedded as <b>A.</b> / <b>E.</b> in text or choices ──
        fmt_text, st['q']['choices'] = _rescue_choices(fmt_text, st['q']['choices'])

        # ── Clean math notation in text and choices ──────────────────────────────
        fmt_text = _clean_math_html(fmt_text)
        for ltr in list(st['q']['choices'].keys()):
            st['q']['choices'][ltr] = _clean_math_html(st['q']['choices'][ltr])

        # ── Prepend context tag(s) — TAG ONLY, no embedded passage text ──────────
        applicable = [e for e in range_elements
                      if e['q_start'] <= qnum <= e['q_end']]
        if applicable:
            min_span = min(e['q_end'] - e['q_start'] for e in applicable)
            best = sorted(
                [e for e in applicable if e['q_end'] - e['q_start'] == min_span],
                key=lambda e: e['tag']
            )
            # Emit only the tag — passage text lives in the passages table
            prefix = ' '.join(f"[{e['tag']}]" for e in best)
            if prefix:
                fmt_text = prefix + ' ' + fmt_text

        st['q']['text'] = fmt_text
        del st['q']['text_parts']
        questions.append(st['q'])
        st['q'] = None

    for fmt, raw in line_pairs:
        sr = raw.strip()
        sf = fmt.strip()
        if not sr:
            continue

        # Strip ALL fraction-rendering artifact prefixes (compiled at module level).
        # Handles multiple consecutive artifacts and HTML-wrapped question numbers.
        sr = _FRAC_PREFIX_RE.sub('', sr)
        sf = _FRAC_PREFIX_RE.sub('', sf)

        mq = Q_NUM_RE.match(sr)
        if mq:
            _finalize_choice()
            _save_q()
            qnum     = int(mq.group(1) or mq.group(3))
            rest_fmt = re.sub(r'^(?:<[^>]+>)*\d{1,3}\.(?:</[^>]+>)*\s*', '', sf).strip()
            st['q'] = {
                'uid':        f"{filename}_Q{qnum}",
                'q_num':      qnum,
                'text_parts': [rest_fmt] if rest_fmt else [],
                'choices':    {},
            }
            st['choice'] = None
            continue

        if st['q'] is None:
            continue

        mc = CHOICE_RE.match(sr)
        if mc:
            _finalize_choice()
            letter       = mc.group(1)
            st['choice'] = letter
            body_fmt     = re.sub(r'^(?:<[^>]+>)*[A-H]\.(?:</[^>]+>)*\s*', '', sf).strip()
            st['q']['choices'][letter] = f"{letter}) {body_fmt}"
            continue

        if st['choice']:
            st['q']['choices'][st['choice']] += ' ' + sf
        else:
            st['q']['text_parts'].append(sf)

    _finalize_choice()
    _save_q()
    return questions


# ─────────────────────────────────────────────────────────────────────────────
# ANSWER KEY EXTRACTION
# ─────────────────────────────────────────────────────────────────────────────

def extract_answer_key(page, filename):
    """
    Parse an answer-key page and return {filename, question, answer} dicts.

    Handles both single-column  ("1. B") and multi-column layouts
    ("1. B    25. A    49. C    73. D    97. B") by using re.findall on the
    full page text rather than matching line-by-line.

    Valid answer values
    -------------------
    A – H          multiple-choice letters
    1, 62, 150     grid-in integers
    2.5, 5.5       grid-in decimals
    -0.4           grid-in negative decimals
    """
    text = page.extract_text() or ''
    if not ANSWER_KEY_RE.search(text):
        return []

    # Match every "N.  answer" pair in the page, regardless of layout.
    # Negative look-behind prevents matching mid-number (e.g. "25.A" where
    # 25 is already the question number, not a float with decimal part).
    pairs = re.findall(
        r'(?<!\d)(\d{1,3})\.\s+([A-H]|-?\d+(?:\.\d+)?)(?=\s|$)',
        text
    )
    rows = []
    for q_str, ans in pairs:
        qnum = int(q_str)
        if 1 <= qnum <= 300:          # sanity-check: plausible question number
            rows.append({'filename': filename,
                         'question': qnum,
                         'answer':   ans})
    # Deduplicate (same question may appear multiple times in a two-column layout)
    seen = set()
    unique = []
    for r in rows:
        if r['question'] not in seen:
            seen.add(r['question'])
            unique.append(r)
    return unique


# ─────────────────────────────────────────────────────────────────────────────
# PER-PDF PROCESSING
# ─────────────────────────────────────────────────────────────────────────────

def process_pdf(pdf_path):
    """
    Returns (question_rows, context_rows, answer_key_rows).

    question_rows  — one row per question  (uid, text, A…H, media_refs, answer)
    context_rows   — one row per shared passage / table / graph (answer = '')
    answer_key_rows— one row per answer-key entry  (filename, question, answer)
    """
    filename        = os.path.basename(pdf_path).replace('.pdf', '')
    all_questions   = {}
    page_media_map  = {}
    all_col_pages   = []
    answer_key_rows = []
    raw_media_log   = []   # list of (pn, mi, media_dict) for media_list.csv

    with pdfplumber.open(pdf_path) as pdf:
        page_q_pos, all_q_order = build_question_position_index(pdf)

        for pn, page in enumerate(pdf.pages):
            page_text = page.extract_text() or ''

            # ── Answer key page? ──────────────────────────────────────────
            if ANSWER_KEY_RE.search(page_text):
                answer_key_rows.extend(extract_answer_key(page, filename))
                continue

            media = detect_media_objects(page)
            if media:
                page_media_map[pn] = media
                for mi, m in enumerate(media):
                    raw_media_log.append((pn, mi, m))

            ll, rl = extract_page_columns(page)
            all_col_pages.append((ll, rl))

        # ── Build flat line stream for passage-range detection ───────────────
        flat_pairs = []
        for ll, rl in all_col_pages:
            for col in (ll, rl):
                flat_pairs.extend([(f, r) for _, f, r in col])

        flat_pairs  = _filter_directions(flat_pairs)
        raw_ranges  = detect_passage_ranges(flat_pairs)

        # ── Assign letters A, B, C… within each range ────────────────────────
        range_elements, claimed_media, range_media_assign = build_range_elements(
            raw_ranges, page_media_map, page_q_pos, filename
        )

        # ── Parse questions ────────────────────────────────────────────────
        for ll, rl in all_col_pages:
            for col in (ll, rl):
                if not col:
                    continue
                pairs = _filter_directions([(f, r) for _, f, r in col])
                for q in parse_questions_from_lines(pairs, filename, range_elements):
                    qn = q['q_num']
                    if qn not in all_questions:
                        all_questions[qn] = q
                    else:
                        ex = all_questions[qn]
                        if len(_strip_tags(q['text'])) > len(_strip_tags(ex['text'])):
                            ex['text'] = q['text']
                        for letter, text in q['choices'].items():
                            existing = ex['choices'].get(letter, '')
                            if len(_strip_tags(text)) > len(_strip_tags(existing)):
                                ex['choices'][letter] = text

    q_media_count, q_media_assign = assign_media_to_questions(
        page_media_map, page_q_pos, all_q_order, claimed_media
    )

    # ── Build answer lookup ───────────────────────────────────────────────────
    answers_dict = {row['question']: row['answer'] for row in answer_key_rows}

    # ── Question rows ─────────────────────────────────────────────────────────
    question_rows    = []
    extra_media_rows = []   # number-line choice media discovered during row building
    for qn in sorted(all_questions.keys()):
        q  = all_questions[qn]
        c  = q['choices']

        # ── Type: consult answer key first (most reliable), then fallback ────────
        answer_val = answers_dict.get(qn, '')
        if answer_val and re.match(r'^-?\d', answer_val):
            q_type = 'grid-in'
        elif re.match(r'^[A-H]$', answer_val):
            q_type = 'mcq'
        elif c:
            q_type = 'mcq'
        else:
            q_type = 'grid-in'

        # ── Choices → sorted list of (letter, prefixed_text) ─────────────────
        choice_items = sorted(c.items())

        # ── Number-line axis label detection ──────────────────────────────────
        # If a choice body is a pure integer sequence (e.g. "–4 –3 –2 –1 0 1 2 3 4 5 6 7")
        # it represents a number-line graphic, not readable text.  Replace each such
        # choice with a media tag and record it in media_list.csv.
        nl_media_rows   = []   # media records to append later
        new_choice_items = []
        nl_idx = 0
        for ltr, txt in choice_items:
            body = re.sub(r'<[^>]+>', '', re.sub(r'^[A-H]\)\s*', '', txt)).strip()
            # Normalise "– 1" → "–1" for the check only
            body_norm = re.sub(r'([−\-–])\s+(\d)', r'\1\2', body)
            tokens = body_norm.split()
            is_numline = (len(tokens) >= 4 and
                          all(re.match(r'^[−\-–]?\d+$', t) for t in tokens))
            if is_numline:
                tag_id  = f"{filename}_Q{qn}_NL{chr(65 + nl_idx)}"
                tag_str = f"[{tag_id}]"
                new_choice_items.append((ltr, f"{ltr}) {tag_str}"))
                nl_media_rows.append({
                    'uid': tag_id, 'filename': filename, 'page': '',
                    'type': 'number_line',
                    'x0': '', 'y0': '', 'x1': '', 'y1': '',
                    'width': '', 'height': '',
                    'scope': 'question',
                    'assigned_to': f"{filename}_Q{qn}",
                    'tag': tag_str,
                    'text': body,
                })
                nl_idx += 1
            else:
                new_choice_items.append((ltr, txt))
        choice_items = new_choice_items
        extra_media_rows.extend(nl_media_rows)

        # ── Strip number-line axis labels from question text ───────────────────
        # When a question already has detected media AND its text begins with a
        # "letter-labels + integer-sequence" prefix (e.g. "P Q R –3 –2 – 1 0 1…"),
        # that prefix is redundant — the graphic is captured in media_refs.
        has_media = q_media_count.get(qn, 0) > 0
        if has_media:
            q_text = q['text']
            # Pattern: optional [TAG] prefixes, then optional single-letter labels
            # (like P Q R), then 4+ signed integers, then rest
            q_text = re.sub(
                r'^((?:\[[^\]]+\]\s*)*)'           # keep any existing [TAG] prefixes
                r'(?:[A-Z]\s+){0,6}'               # optional letter labels: P Q R
                r'(?:[−\-–]?\s*\d+\s+){4,}'        # 4+ signed integers (axis numbers)
                r'[−\-–]?\s*\d+\s*',               # final integer
                r'\1',
                q_text
            )
            q['text'] = q_text.strip() if q_text.strip() else q['text']

        n_choices = len(choice_items)

        # ── Media tags for this question ──────────────────────────────────────
        media_tags = [f"[{filename}_Q{qn}_{chr(65+i)}]"
                      for i in range(q_media_count.get(qn, 0))]
        n_media = len(media_tags)

        # ── Distribute media into choices when count matches ──────────────────
        # Only do this when the choices themselves carry little text — i.e. the
        # choice content IS the graphic (e.g. four number-line answer graphs).
        # Choices with substantial text (quoted sentences, expressions) should
        # NOT have media distributed even if the count happens to match.
        _GRAPHIC_CHOICE_BODY_THRESHOLD = 25  # max avg chars of choice body text

        distribute = False
        if n_media > 0 and n_choices > 0 and n_media == n_choices:
            bodies = [re.sub(r'^[A-H]\)\s*', '', txt).strip()
                      for _, txt in choice_items]
            avg_body = sum(len(b) for b in bodies) / max(len(bodies), 1)
            distribute = avg_body < _GRAPHIC_CHOICE_BODY_THRESHOLD

        if distribute:
            final_choices = [
                f"{text} {media_tags[i]}"
                for i, (_, text) in enumerate(choice_items)
            ]
            media_refs_str = ''   # already embedded in choices
        else:
            final_choices  = [text for _, text in choice_items]
            media_refs_str = ', '.join(media_tags)

        # Pad / truncate to exactly 4 columns
        while len(final_choices) < 4:
            final_choices.append('')

        question_rows.append({
            'type':     q_type,
            'uid':      q['uid'],
            'text':     q['text'],
            'choice_1': final_choices[0],
            'choice_2': final_choices[1],
            'choice_3': final_choices[2],
            'choice_4': final_choices[3],
            'media_refs': media_refs_str,
            'answer':   answers_dict.get(qn, ''),
        })

    print(f"  [{filename}]  {len(question_rows)} questions  |  "
          f"{sum(q_media_count.values())} per-Q media  |  "
          f"{len(range_elements)} range elements across {len(raw_ranges)} ranges  |  "
          f"{len(answer_key_rows)} answers loaded")

    # ── Build media records for media_list.csv ────────────────────────────────
    media_records = []

    # ── 1. Text passages (range element A) ────────────────────────────────────
    for elem in range_elements:
        if elem['text'].startswith('['):
            continue   # visual placeholder ([TABLE] / [GRAPHIC]) — handled below
        qstart, qend = elem['q_start'], elem['q_end']
        media_records.append({
            'uid':         elem['tag'],
            'filename':    filename,
            'page':        elem.get('first_page', ''),
            'type':        'passage',
            'x0': '', 'y0': '', 'x1': '', 'y1': '',
            'width': '', 'height': '',
            'scope':       'range',
            'assigned_to': f"{filename}_Q{qstart}-Q{qend}",
            'tag':         f"[{elem['tag']}]",
            'text':        elem['text'],
        })

    # ── 2. Visual media objects (graphics, tables, images, rects) ─────────────
    for pn, mi, m in raw_media_log:
        key = (pn, mi)
        x0  = round(m.get('x0', m['x_center'] - 50))
        x1  = round(m.get('x1', m['x_center'] + 50))
        y0, y1 = round(m['y0']), round(m['y1'])

        if key in range_media_assign:
            tag_uid      = range_media_assign[key]
            assigned_to  = re.sub(r'_[A-Z]$', '', tag_uid)
            media_tag    = f"[{tag_uid}]"
            scope        = 'range'
        elif key in q_media_assign:
            qn, per_idx  = q_media_assign[key]
            assigned_to  = f"{filename}_Q{qn}"
            media_tag    = f"[{filename}_Q{qn}_{chr(65 + per_idx)}]"
            scope        = 'question'
        else:
            assigned_to  = ''
            media_tag    = ''
            scope        = 'unassigned'

        media_records.append({
            'uid':         f"{filename}_P{pn + 1}_{mi}",
            'filename':    filename,
            'page':        pn + 1,
            'type':        m['type'],
            'x0':          x0,
            'y0':          y0,
            'x1':          x1,
            'y1':          y1,
            'width':       x1 - x0,
            'height':      y1 - y0,
            'scope':       scope,
            'assigned_to': assigned_to,
            'tag':         media_tag,
            'text':        '',
        })

    # ── 3. Number-line choice media (detected during question row building) ─────
    media_records.extend(extra_media_rows)

    return question_rows, media_records


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) > 1:
        pdf_files = sys.argv[1:]
    else:
        if not os.path.exists(INPUT_FOLDER):
            os.makedirs(INPUT_FOLDER)
            print(f"Created '{INPUT_FOLDER}/' — place your PDFs there and rerun.")
            return
        pdf_files = [
            os.path.join(INPUT_FOLDER, f)
            for f in sorted(os.listdir(INPUT_FOLDER))
            if f.lower().endswith('.pdf')
        ]

    if not pdf_files:
        print("No PDF files found.")
        return

    out_dir = os.path.dirname(OUTPUT_CSV)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    all_q_rows     = []
    all_media_rows = []

    for pdf_path in pdf_files:
        print(f"Processing: {pdf_path}")
        try:
            q_rows, m_rows = process_pdf(pdf_path)
            all_q_rows.extend(q_rows)
            all_media_rows.extend(m_rows)
        except Exception as e:
            print(f"  ERROR processing {pdf_path}: {e}")
            import traceback; traceback.print_exc()

    # ── Write question bank ───────────────────────────────────────────────────
    fieldnames = ['type', 'uid', 'text',
                  'choice_1', 'choice_2', 'choice_3', 'choice_4',
                  'media_refs', 'answer']
    with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        w.writeheader()
        w.writerows(all_q_rows)

    # ── Write media list ──────────────────────────────────────────────────────
    media_fields = ['uid', 'filename', 'page', 'type',
                    'x0', 'y0', 'x1', 'y1', 'width', 'height',
                    'scope', 'assigned_to', 'tag', 'text']
    with open(MEDIA_CSV, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=media_fields)
        w.writeheader()
        w.writerows(all_media_rows)

    print(f"\n✓ Done.  {len(all_q_rows)} questions  →  '{OUTPUT_CSV}'"
          f"\n         {len(all_media_rows)} media objects →  '{MEDIA_CSV}'")


if __name__ == '__main__':
    main()