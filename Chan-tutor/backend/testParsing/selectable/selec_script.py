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
TWO_COL_SPLIT  = 295          # x-pixel boundary between left / right math columns

# ─────────────────────────────────────────────────────────────────────────────
# REGEX
# ─────────────────────────────────────────────────────────────────────────────
ITEM_CODE_RE     = re.compile(
    r'^[A-Z]{2,}\w*_\d+$'       # EWSA17029_2  ER01101812_3  M170522
    r'|^[A-Z]{2,5}\d{4,}\w*$'   # ER0110  ER0236  M060060  (no underscore variant)
)
PAGE_NUM_ONLY_RE = re.compile(r'^\s*\d{1,3}\s*$')
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
            found.append({'y0': by0, 'y1': by1,
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
    Returns {q_num: count}.
    """
    if claimed_media is None:
        claimed_media = set()
    q_media_count = defaultdict(int)
    for pn, media_list in page_media_map.items():
        q_on_page  = page_q_pos.get(pn, [])
        is_two_col = any(q['col'] == 'right' for q in q_on_page)
        for mi, media in enumerate(media_list):
            if (pn, mi) in claimed_media:
                continue                       # already tagged as a range element
            med_y  = (media['y0'] + media['y1']) / 2
            med_xc = media['x_center']
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
                q_media_count[aq['q_num']] += 1
    return q_media_count


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
    """
    # question → page mapping
    q_to_pages = defaultdict(set)
    for pn, entries in page_q_pos.items():
        for e in entries:
            q_to_pages[e['q_num']].add(pn)

    tagged_elements = []
    claimed_media   = set()

    for rng in raw_ranges:
        qs, qe    = rng['q_start'], rng['q_end']
        elem_list = []   # (text_for_csv,)  ordered A, B, C…

        # ── Element A: passage text ────────────────────────────────────────────
        if rng['text'].strip():
            elem_list.append(rng['text'])

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
                    # Use a placeholder; the actual image/table content is in media_refs
                    elem_list.append(f"[{med['type'].upper()}]")
                    claimed_media.add(key)

        # ── Assign letters within this range ──────────────────────────────────
        for idx, elem_text in enumerate(elem_list):
            letter = chr(65 + idx)
            tag    = f"{filename}_Q{qs}-Q{qe}_{letter}"
            tagged_elements.append({
                'tag':     tag,
                'q_start': qs,
                'q_end':   qe,
                'text':    elem_text,
            })

    return tagged_elements, claimed_media


# keep old name as an alias used by process_pdf (thin wrapper)
def detect_shared_contexts(flat_pairs, filename):
    """Delegates to detect_passage_ranges; letters are now assigned by build_range_elements."""
    return detect_passage_ranges(flat_pairs)


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
            st['q']['choices'][st['choice']] = clean_trailing_noise(
                st['q']['choices'][st['choice']]
            )
        st['choice'] = None

    def _save_q():
        if not st['q']:
            return
        qnum     = st['q']['q_num']
        fmt_text = clean_trailing_noise(' '.join(st['q']['text_parts']).strip())

        # Find all elements covering this question
        applicable = [e for e in range_elements
                      if e['q_start'] <= qnum <= e['q_end']]
        if applicable:
            # Pick the most specific range (smallest span)
            min_span = min(e['q_end'] - e['q_start'] for e in applicable)
            best = sorted(
                [e for e in applicable if e['q_end'] - e['q_start'] == min_span],
                key=lambda e: e['tag']
            )
            # Embed full element content so each question row is self-contained:
            #   [TAG_A] <passage text…>  [TAG_B] [GRAPHIC]  <question stem>
            prefix_parts = [f"[{e['tag']}] {e['text']}" for e in best]
            prefix = '  '.join(prefix_parts)   # double-space between elements
            if prefix:
                fmt_text = prefix + '  ' + fmt_text

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
    filename       = os.path.basename(pdf_path).replace('.pdf', '')
    all_questions  = {}
    page_media_map = {}
    all_col_pages  = []     # list of (left_lines, right_lines) per page
    answer_key_rows = []

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
        # Each range can have multiple elements (passage → A, table → B, …).
        # claimed_media tracks media already tagged as a range element so they
        # are excluded from the per-question media_refs counter.
        range_elements, claimed_media = build_range_elements(
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

    q_media_count = assign_media_to_questions(
        page_media_map, page_q_pos, all_q_order, claimed_media
    )

    # ── Build answer lookup ───────────────────────────────────────────────────
    answers_dict = {row['question']: row['answer'] for row in answer_key_rows}

    # ── Question rows ─────────────────────────────────────────────────────────
    question_rows = []
    for qn in sorted(all_questions.keys()):
        q  = all_questions[qn]
        c  = q['choices']

        # ── Type: consult answer key first (most reliable), then fallback ────────
        answer_val = answers_dict.get(qn, '')
        if answer_val and re.match(r'^-?\d', answer_val):
            q_type = 'grid-in'   # numeric answer (e.g. 2.5, -0.4) → always grid-in
        elif re.match(r'^[A-H]$', answer_val):
            q_type = 'mcq'       # letter answer → always multiple choice
        elif c:
            q_type = 'mcq'       # has parsed choices → multiple choice
        else:
            q_type = 'grid-in'   # no choices, no answer → grid-in

        # ── Choices → sorted list of (letter, prefixed_text) ─────────────────
        choice_items = sorted(c.items())   # e.g. [('A','A) …'),…] or [('E','E) …'),…]
        n_choices    = len(choice_items)

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

    return question_rows


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

    all_q_rows = []

    for pdf_path in pdf_files:
        print(f"Processing: {pdf_path}")
        try:
            all_q_rows.extend(process_pdf(pdf_path))
        except Exception as e:
            print(f"  ERROR processing {pdf_path}: {e}")
            import traceback; traceback.print_exc()

    fieldnames = ['type', 'uid', 'text',
                  'choice_1', 'choice_2', 'choice_3', 'choice_4',
                  'media_refs', 'answer']
    with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        w.writeheader()
        w.writerows(all_q_rows)

    print(f"\n✓ Done.  {len(all_q_rows)} questions  →  '{OUTPUT_CSV}'")


if __name__ == '__main__':
    main()