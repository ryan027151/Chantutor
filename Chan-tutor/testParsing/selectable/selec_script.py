"""
SHSAT PDF Question Bank Parser
================================
Parses SHSAT-format test PDFs into a structured CSV with:
  uid, text, A, B, C, D, E, F, G, H, media_refs

Media objects (tables, graphs, diagrams) are tagged as:
  [FILENAME_QN_A], [FILENAME_QN_B], etc.

Usage:
    python shsat_parser.py                   # processes all PDFs in ./pdfs_to_process/
    python shsat_parser.py path/to/file.pdf  # single file
"""

import os
import re
import csv
import sys
from collections import defaultdict

import pdfplumber

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────────────────────────────────────
INPUT_FOLDER = "pdfs_to_process"
OUTPUT_CSV   = "result/question_bank.csv"

TWO_COL_SPLIT = 295   # pixel x boundary between left and right columns

# ─────────────────────────────────────────────────────────────────────────────
# NOISE PATTERNS
# ─────────────────────────────────────────────────────────────────────────────
ITEM_CODE_RE = re.compile(r'^[A-Z]{2,}\w*_\d+$')
PAGE_NOISE_RE = re.compile(
    r'^(FORM\s+[A-Z0-9]|CONTINUE\s+ON|CONTINUE\s+TO|THIS\s+IS\s+THE\s+END|'
    r'CONTINUEON|TO\s+THE\s+NEXT|NEXT\s+PAGE|'
    r'STOP|GO\s+ON|DIRECTIONS?\s*:|PART\s+[12]\s*[—–]|'
    r'QUESTIONS?\s+\d|READING\s+COMPREHENSION|REVISING.EDITING|'
    r'GRID.IN|MULTIPLE\s+CHOICE|IMPORTANT\s+NOTES|'
    r'Answer\s+Key|Sample\s+Test)',
    re.IGNORECASE
)
PAGE_NUM_ONLY_RE = re.compile(r'^\s*\d{1,3}\s*$')
CHOICE_RE = re.compile(r'^([A-H])\.\s+(.*)', re.DOTALL)
Q_NUM_RE  = re.compile(r'^(\d{1,3})\.\s*(.*)', re.DOTALL)


def is_noise_line(line):
    s = line.strip()
    if not s:
        return True
    if ITEM_CODE_RE.match(s):
        return True
    if PAGE_NOISE_RE.match(s):
        return True
    if PAGE_NUM_ONLY_RE.match(s):
        return True
    if re.match(r'^FORM\s+[A-Z]\s+\d+\s*$', s):
        return True
    if re.match(r'^\d{1,3}\s+CONTINUE', s, re.I):
        return True
    return False


# ─────────────────────────────────────────────────────────────────────────────
# WORD → LINE RECONSTRUCTION
# ─────────────────────────────────────────────────────────────────────────────

def words_to_text_lines(word_list, y_tolerance=4):
    if not word_list:
        return []
    sorted_words = sorted(
        word_list,
        key=lambda w: (round(w['top'] / y_tolerance) * y_tolerance, w['x0'])
    )
    lines, cur_words, cur_y = [], [], None
    for w in sorted_words:
        wy = round(w['top'] / y_tolerance) * y_tolerance
        if cur_y is None or abs(wy - cur_y) <= y_tolerance * 2:
            cur_words.append(w)
            if cur_y is None:
                cur_y = wy
        else:
            text = ' '.join(ww['text'] for ww in sorted(cur_words, key=lambda ww: ww['x0']))
            lines.append((cur_words[0]['top'], text))
            cur_words, cur_y = [w], wy
    if cur_words:
        text = ' '.join(ww['text'] for ww in sorted(cur_words, key=lambda ww: ww['x0']))
        lines.append((cur_words[0]['top'], text))
    return lines


# ─────────────────────────────────────────────────────────────────────────────
# COLUMN-AWARE PAGE TEXT EXTRACTION
# ─────────────────────────────────────────────────────────────────────────────

def extract_page_columns(page):
    words = page.extract_words(keep_blank_chars=False, x_tolerance=3, y_tolerance=3)
    if not words:
        return [], []
    q_words = [w for w in words if re.match(r'^\d{1,3}\.$', w['text'])]
    is_two_col = any(w['x0'] >= TWO_COL_SPLIT for w in q_words)
    if not is_two_col:
        lines = words_to_text_lines(words)
        return [t for _, t in lines if not is_noise_line(t)], []
    left_words  = [w for w in words if w['x0'] < TWO_COL_SPLIT]
    right_words = [w for w in words if w['x0'] >= TWO_COL_SPLIT]
    clean_left  = [t for _, t in words_to_text_lines(left_words)  if not is_noise_line(t)]
    clean_right = [t for _, t in words_to_text_lines(right_words) if not is_noise_line(t)]
    return clean_left, clean_right


# ─────────────────────────────────────────────────────────────────────────────
# MEDIA DETECTION
# ─────────────────────────────────────────────────────────────────────────────

def detect_media_objects(page):
    page_w, page_h = page.width, page.height
    found = []

    # 1. Data tables via pdfplumber table finder
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
        if w < 100 and h > 120:   # answer-bubble column
            continue
        found.append({'y0': img['y0'], 'y1': img['y1'],
                      'x_center': (img['x0'] + img['x1']) / 2, 'type': 'image'})

    # 3. Rect-based diagram frames (not passage boxes)
    for r in page.rects:
        w, h = r['width'], r['height']
        if w > page_w * 0.85 or h > page_h * 0.85:
            continue   # full-page border
        if w > 350 or w < 30 or h < 25:
            continue
        bbox = (r['x0'], r['y0'], r['x1'], r['y1'])
        try:
            txt = (page.crop(bbox).extract_text() or '').strip()
        except Exception:
            txt = ''
        word_count = len(txt.split())
        # Wide rects with many words are question/answer text boxes
        if w > 200 and word_count > 10:
            continue
        found.append({'y0': r['y0'], 'y1': r['y1'],
                      'x_center': (r['x0'] + r['x1']) / 2, 'type': 'rect'})

    # 4. Curve/line clusters (geometric diagrams, graphs) — per column
    graphic_items = []
    for c in page.curves:
        if c['height'] > 15 and c['width'] > 15:
            graphic_items.append({'y0': c['y0'], 'y1': c['y1'],
                                   'x0': c['x0'], 'x1': c['x1']})
    for ln in page.lines:
        dx = abs(ln['x1'] - ln['x0'])
        dy = abs(ln['y1'] - ln['y0'])
        span = max(dx, dy)
        if dx > page_w * 0.7 or span < 30:
            continue
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
                # Keep: ≥2 elements with >40px span, OR single long element >80px
                if not ((cl['count'] >= 2 and span > 40) or
                        (cl['count'] >= 1 and span > 80)):
                    continue
                if cl['y0'] < 30 or cl['y0'] > page_h - 30:
                    continue
                found.append({'y0': cl['y0'], 'y1': cl['y1'],
                              'x_center': (cl['x0'] + cl['x1']) / 2, 'type': 'graphic'})

    # 5. De-duplicate overlapping detections
    result = []
    for item in sorted(found, key=lambda x: x['y0']):
        overlap = False
        for ex in result:
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
# QUESTION TEXT PARSER
# ─────────────────────────────────────────────────────────────────────────────

def parse_questions_from_lines(lines, filename):
    questions      = []
    current_q      = None
    current_choice = None

    def finalize_choice():
        nonlocal current_choice
        if current_choice and current_q:
            current_q['choices'][current_choice] = \
                current_q['choices'][current_choice].strip()
        current_choice = None

    def save_q():
        nonlocal current_q
        if current_q:
            current_q['text'] = ' '.join(current_q['text_parts']).strip()
            del current_q['text_parts']
            questions.append(current_q)
        current_q = None

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        m_q = Q_NUM_RE.match(stripped)
        if m_q:
            finalize_choice()
            save_q()
            q_num = int(m_q.group(1))
            rest  = m_q.group(2).strip()
            current_q = {
                'uid': f"{filename}_Q{q_num}",
                'q_num': q_num,
                'text_parts': [rest] if rest else [],
                'choices': {},
            }
            current_choice = None
            continue

        if current_q is None:
            continue

        m_c = CHOICE_RE.match(stripped)
        if m_c:
            finalize_choice()
            current_choice = m_c.group(1)
            current_q['choices'][current_choice] = m_c.group(2).strip()
            continue

        if current_choice is not None:
            current_q['choices'][current_choice] += ' ' + stripped
            continue

        current_q['text_parts'].append(stripped)

    finalize_choice()
    save_q()
    return questions


# ─────────────────────────────────────────────────────────────────────────────
# MEDIA → QUESTION ASSIGNMENT  (cross-page aware)
# ─────────────────────────────────────────────────────────────────────────────

def build_question_position_index(pdf):
    page_q_pos  = {}
    all_q_order = []
    for page_num, page in enumerate(pdf.pages):
        if 'answer key' in (page.extract_text() or '').lower():
            continue
        words = page.extract_words(keep_blank_chars=False, x_tolerance=3, y_tolerance=3)
        entries = []
        for w in words:
            if not re.match(r'^\d{1,3}\.$', w['text']):
                continue
            try:
                q_num = int(w['text'].rstrip('.'))
            except ValueError:
                continue
            col = 'right' if w['x0'] >= TWO_COL_SPLIT else 'left'
            entries.append({'q_num': q_num, 'y': w['top'], 'x': w['x0'], 'col': col})
            all_q_order.append((page_num, q_num, w['top']))
        if entries:
            page_q_pos[page_num] = entries
    all_q_order.sort(key=lambda x: (x[0], x[2]))
    return page_q_pos, all_q_order


def assign_media_to_questions(page_media_map, page_q_pos, all_q_order):
    q_media_count = defaultdict(int)
    for page_num, media_list in page_media_map.items():
        q_on_page  = page_q_pos.get(page_num, [])
        is_two_col = any(q['col'] == 'right' for q in q_on_page)
        for media in media_list:
            med_y   = (media['y0'] + media['y1']) / 2
            med_xc  = media['x_center']
            med_col = 'right' if med_xc >= TWO_COL_SPLIT else 'left'
            assigned_q = None
            if q_on_page:
                candidates = (
                    [q for q in q_on_page if q['col'] == med_col] or q_on_page
                ) if is_two_col else q_on_page
                above = [q for q in candidates if q['y'] <= med_y + 60]
                assigned_q = (
                    max(above, key=lambda q: q['y']) if above
                    else min(candidates, key=lambda q: q['y'])
                )
            else:
                # Passage-only page: forward-assign to first question on a later page
                for pn, qn, _ in all_q_order:
                    if pn > page_num:
                        assigned_q = {'q_num': qn}
                        break
            if assigned_q:
                q_media_count[assigned_q['q_num']] += 1
    return q_media_count


# ─────────────────────────────────────────────────────────────────────────────
# MAIN PER-PDF PROCESSING
# ─────────────────────────────────────────────────────────────────────────────

def process_pdf(pdf_path):
    filename      = os.path.basename(pdf_path).replace('.pdf', '')
    all_questions = {}
    page_media_map = {}

    with pdfplumber.open(pdf_path) as pdf:
        page_q_pos, all_q_order = build_question_position_index(pdf)

        for page_num, page in enumerate(pdf.pages):
            if 'answer key' in (page.extract_text() or '').lower():
                continue

            media = detect_media_objects(page)
            if media:
                page_media_map[page_num] = media

            left_lines, right_lines = extract_page_columns(page)

            for col_lines in (left_lines, right_lines):
                if not col_lines:
                    continue
                for q in parse_questions_from_lines(col_lines, filename):
                    q_num = q['q_num']
                    if q_num not in all_questions:
                        all_questions[q_num] = q
                    else:
                        ex = all_questions[q_num]
                        if len(q['text']) > len(ex['text']):
                            ex['text'] = q['text']
                        for letter, text in q['choices'].items():
                            if letter not in ex['choices'] or \
                               len(text) > len(ex['choices'][letter]):
                                ex['choices'][letter] = text

    q_media_count = assign_media_to_questions(page_media_map, page_q_pos, all_q_order)

    results = []
    for q_num in sorted(all_questions.keys()):
        q = all_questions[q_num]
        c = q['choices']
        media_refs = [f"[{filename}_Q{q_num}_{chr(65+i)}]"
                      for i in range(q_media_count.get(q_num, 0))]
        results.append({
            'uid':   q['uid'],      'text': q['text'],
            'A': c.get('A',''),    'B': c.get('B',''),
            'C': c.get('C',''),    'D': c.get('D',''),
            'E': c.get('E',''),    'F': c.get('F',''),
            'G': c.get('G',''),    'H': c.get('H',''),
            'media_refs': ', '.join(media_refs),
        })

    print(f"  [{filename}] {len(results)} questions, "
          f"{sum(q_media_count.values())} media objects assigned.")
    return results


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

    all_rows = []
    for pdf_path in pdf_files:
        print(f"Processing: {pdf_path}")
        try:
            all_rows.extend(process_pdf(pdf_path))
        except Exception as e:
            print(f"  ERROR: {e}")
            import traceback; traceback.print_exc()

    fieldnames = ['uid','text','A','B','C','D','E','F','G','H','media_refs']
    with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_rows)

    print(f"\n✓ Done. {len(all_rows)} questions written to '{OUTPUT_CSV}'.")


if __name__ == '__main__':
    main()