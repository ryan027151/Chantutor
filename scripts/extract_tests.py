#!/usr/bin/env python3
"""
Extract SHSAT Practice Test questions (A-D) using Claude vision API.
All question content is inside rasterized screenshot images in the PDFs,
so text-based parsing is not possible — this renders each page as PNG
and sends it to Claude to extract question text, choices, type, and answer.

Requirements: pymupdf, requests (already installed)
  python -m pip install pymupdf requests

Usage:
  cd Chantutor/
  set ANTHROPIC_API_KEY=sk-ant-...        # Windows
  export ANTHROPIC_API_KEY=sk-ant-...     # Mac/Linux
  python scripts/extract_tests.py
  python scripts/extract_tests.py --test A
  python scripts/extract_tests.py --test A --dpi 180

Output: scripts/output/questions_25{A,B,C,D}.csv
  Resumes automatically from checkpoint if interrupted.
  Run import_to_supabase.py after this completes.
"""

import argparse
import base64
import csv
import json
import os
import re
import sys
import time
from pathlib import Path

import fitz  # PyMuPDF
import requests

# ── Paths ──────────────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = ROOT / "Chan-tutor" / "backend" / "testParsing" / "selectable" / "pdfs_to_process"
OUT_DIR = Path(__file__).parent / "output"
OUT_DIR.mkdir(exist_ok=True)

TESTS = {
    "A": ("SHSAT Practice Test A Printable Test.pdf", "25A"),
    "B": ("SHSAT Practice Test B Printable Test.pdf", "25B"),
    "C": ("SHSAT Practice Test C Printable Test.pdf", "25C"),
    "D": ("SHSAT Practice Test D Printable Test.pdf", "25D"),
}

# Matches the all_questions table column order
CSV_COLS = [
    "uid", "type", "subject", "sub_category", "difficulty",
    "text", "choice_1", "choice_2", "choice_3", "choice_4",
    "answer", "media_refs", "source", "status", "extra_data",
]

MATH_SUBCATS = [
    "Arithmetic", "Algebra_and_Equations", "Algebraic_Expressions", "Geometry",
    "Fraction_Word_Problems", "Percentage", "Ratios_and_Proportions",
    "Probability", "Stats_and_Data_Analysis", "Sequence", "Inequalities",
    "Linear_Eq._Formula",
]
ELA_SUBCATS = ["Reading_Comprehension", "Revising_Editing", "Vocabulary_in_Context"]

# ── Page classification ────────────────────────────────────────────────────────

# Question pages have a short label containing "Item N"
ITEM_RE = re.compile(r"\bItem\s+\d+\b", re.IGNORECASE)
MATH_RE = re.compile(r"\bMath\b", re.IGNORECASE)
PASSAGE_SET_RE = re.compile(r"Passage Set (\d+)", re.IGNORECASE)


def classify_page(page):
    """
    Returns ('question', label) | ('passage', full_text) | ('separator', label)

    Question pages: short total text (< 300 chars) containing "Item N" somewhere.
      Some pages have a code on line 1 and "Math Item N" on line 2, so we scan
      all lines (not just the first) and return the line that matches.
    Passage pages: have > 15 words of extractable text (catches glossary pages too).
    Separator pages: everything else (covers, section headers, blanks).
    """
    text = page.get_text().strip()

    # Question pages: short total text + "Item N" anywhere in the text
    if len(text) < 300 and ITEM_RE.search(text):
        for line in text.split("\n"):
            line = line.strip()
            if line and ITEM_RE.search(line):
                return ("question", line)

    # Passage pages: enough extractable words (lowered to 15 to catch glossary pages)
    words = page.get_text("words")
    if len(words) > 15:
        return ("passage", text)

    first_line = text.split("\n")[0].strip() if text else ""
    return ("separator", first_line)


def extract_structure(doc):
    """
    Scan all pages and return:
      ordered_questions: [{idx, label, subject, set_num}]  — ELA first, then Math
      passage_map: {set_num_str: passage_text}
    """
    page_meta = []
    for i in range(len(doc)):
        kind, data = classify_page(doc[i])
        page_meta.append({"idx": i, "kind": kind, "data": data})

    # ── Build passage_map ──────────────────────────────────────────────────────
    # Structure in printable PDFs: [Set N questions] → [sep] → [passage pages] → [Set N+1 ...]
    # So passage pages appear AFTER question pages for the same set.
    last_seen_set = None
    passage_buffer = []
    passage_map = {}

    for p in page_meta:
        if p["kind"] == "question":
            label = p["data"]
            m = PASSAGE_SET_RE.search(label)
            if m:
                set_num = m.group(1)
                if set_num != last_seen_set:
                    # Switching to a new passage set — save buffered passage to previous set
                    if passage_buffer and last_seen_set:
                        passage_map[last_seen_set] = "\n\n".join(passage_buffer).strip()
                    passage_buffer = []
                    last_seen_set = set_num
            else:
                # Non-passage-set question (ELA standalone, Math)
                if passage_buffer and last_seen_set:
                    passage_map[last_seen_set] = "\n\n".join(passage_buffer).strip()
                passage_buffer = []
                last_seen_set = None
        elif p["kind"] == "passage":
            passage_buffer.append(p["data"])
        # separators: ignored

    # Final flush for last passage set
    if passage_buffer and last_seen_set:
        passage_map[last_seen_set] = "\n\n".join(passage_buffer).strip()

    # ── Collect question pages ─────────────────────────────────────────────────
    ela_qs, math_qs = [], []
    for p in page_meta:
        if p["kind"] != "question":
            continue
        label = p["data"]
        is_math = bool(MATH_RE.search(label))
        subject = "math" if is_math else "english"
        m = PASSAGE_SET_RE.search(label)
        set_num = m.group(1) if m else None
        entry = {"idx": p["idx"], "label": label, "subject": subject, "set_num": set_num}
        (math_qs if is_math else ela_qs).append(entry)

    ela_qs.sort(key=lambda x: x["idx"])
    math_qs.sort(key=lambda x: x["idx"])
    return ela_qs + math_qs, passage_map


# ── Image rendering ────────────────────────────────────────────────────────────

def render_page_b64(page, dpi: int) -> str:
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    return base64.b64encode(pix.tobytes("png")).decode()


# ── Claude API ─────────────────────────────────────────────────────────────────

CLAUDE_URL = "https://api.anthropic.com/v1/messages"


def call_claude(api_key: str, img_b64: str, label: str, passage_text: str) -> dict:
    is_math = bool(MATH_RE.search(label))
    subject = "math" if is_math else "english"
    subcats = ", ".join(MATH_SUBCATS if is_math else ELA_SUBCATS)

    passage_block = ""
    if passage_text and not is_math:
        truncated = passage_text[:4000]
        passage_block = (
            "\n\nREADING PASSAGE (use this to determine the correct answer):\n"
            "---\n" + truncated + "\n---"
        )

    prompt = f"""You are extracting a question from a New York City SHSAT practice test screenshot.
Page label: {label}
Subject: {subject}{passage_block}

The image shows the digital test interface. Extract every field from the question shown.
Respond with ONLY valid JSON (no markdown, no extra text):

{{
  "question_text": "complete question text exactly as displayed",
  "type": "mcq" | "multi-select" | "grid-in",
  "choices": {{"A": "text", "B": "text", "C": "text", "D": "text", "E": null, "F": null}},
  "select_count": 1,
  "answer": "B",
  "sub_category": "one of: {subcats}"
}}

TYPE RULES:
- "mcq": round radio buttons (○), one correct answer
- "multi-select": square checkboxes (□) or says "Select the N correct answers"; set select_count = N
- "grid-in": open-ended numeric box, no choices shown; student types a number

ANSWER RULES:
- mcq: single letter e.g. "B"
- multi-select: sorted comma-separated letters e.g. "A,C" — determine ALL N correct answers
- grid-in: the numeric answer string e.g. "42" or "3/4"
- Set E/F to null if those choices don't appear
- For ELA: use the passage text above to determine which answer is correct
- For Math: solve the problem to determine the correct answer"""

    body = {
        "model": "claude-opus-4-8",
        "max_tokens": 800,
        "messages": [{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": "image/png", "data": img_b64},
                },
                {"type": "text", "text": prompt},
            ],
        }],
    }

    resp = requests.post(
        CLAUDE_URL,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json=body,
        timeout=90,
    )
    resp.raise_for_status()

    raw = resp.json()["content"][0]["text"]
    # Strip accidental markdown fences
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.MULTILINE)
    cleaned = re.sub(r"\s*```\s*$", "", cleaned.strip())
    return json.loads(cleaned)


# ── Per-test processing ────────────────────────────────────────────────────────

def process_test(letter: str, api_key: str, dpi: int):
    pdf_name, source = TESTS[letter]
    pdf_path = PDF_DIR / pdf_name

    if not pdf_path.exists():
        print(f"  ERROR: PDF not found at {pdf_path}")
        return

    print(f"\n{'='*60}")
    print(f"Test {letter} | source={source}")
    print(f"PDF: {pdf_path.name}")

    doc = fitz.open(str(pdf_path))
    questions, passage_map = extract_structure(doc)

    ela_count = sum(1 for q in questions if q["subject"] == "english")
    math_count = sum(1 for q in questions if q["subject"] == "math")
    print(f"Pages: {len(doc)} | ELA: {ela_count} | Math: {math_count} | Passage sets with text: {len(passage_map)}")

    # Checkpoint: allows resuming interrupted runs
    ckpt_path = OUT_DIR / f"checkpoint_{source}.json"
    checkpoint: dict = {}
    if ckpt_path.exists():
        try:
            checkpoint = json.loads(ckpt_path.read_text(encoding="utf-8"))
            print(f"Resuming from checkpoint ({len(checkpoint)} questions already done)")
        except Exception:
            pass

    rows = []

    for i, qp in enumerate(questions):
        uid = f"{source}_Q{i + 1}"
        label = qp["label"]
        subject = qp["subject"]
        set_num = qp["set_num"]

        if uid in checkpoint:
            rows.append(checkpoint[uid])
            print(f"  {uid} [cached]")
            continue

        passage_text = passage_map.get(set_num, "") if set_num else ""

        page = doc[qp["idx"]]
        img_b64 = render_page_b64(page, dpi)

        print(f"  {uid} | {label[:55]}", end=" ... ", flush=True)

        try:
            result = call_claude(api_key, img_b64, label, passage_text)
        except Exception as exc:
            print(f"ERROR: {exc}")
            result = {
                "question_text": f"[EXTRACTION ERROR: {label}]",
                "type": "mcq",
                "choices": {"A": "", "B": "", "C": "", "D": "", "E": None, "F": None},
                "select_count": 1,
                "answer": "",
                "sub_category": ELA_SUBCATS[0] if subject == "english" else MATH_SUBCATS[0],
            }

        q_type = result.get("type") or "mcq"
        choices = result.get("choices") or {}
        select_count = int(result.get("select_count") or 1)

        # Build extra_data for multi-select (same shape as existing DB rows)
        extra_data = None
        if q_type == "multi-select":
            ed: dict = {"select_count": select_count}
            e_text = (choices.get("E") or "").strip()
            f_text = (choices.get("F") or "").strip()
            if e_text:
                ed["choice_5"] = e_text
            if f_text:
                ed["choice_6"] = f_text
            extra_data = json.dumps(ed)

        row = {
            "uid": uid,
            "type": q_type,
            "subject": subject,
            "sub_category": (result.get("sub_category") or "").strip()
                or (ELA_SUBCATS[0] if subject == "english" else MATH_SUBCATS[0]),
            "difficulty": "",  # fill via admin panel after import
            "text": (result.get("question_text") or "").strip(),
            "choice_1": (choices.get("A") or "").strip(),
            "choice_2": (choices.get("B") or "").strip(),
            "choice_3": (choices.get("C") or "").strip(),
            "choice_4": (choices.get("D") or "").strip(),
            "answer": (result.get("answer") or "").strip(),
            "media_refs": "",
            "source": source,
            "status": "pending",  # admin reviews before approving
            "extra_data": extra_data or "",
        }

        rows.append(row)
        checkpoint[uid] = row
        ckpt_path.write_text(json.dumps(checkpoint, indent=2, ensure_ascii=False), encoding="utf-8")

        ans = row["answer"] or "(empty)"
        print(f"type={q_type} sub={row['sub_category']} ans={ans}")

        time.sleep(1.0)  # respect API rate limits

    doc.close()

    csv_path = OUT_DIR / f"questions_{source}.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    errors = sum(1 for r in rows if r["text"].startswith("[EXTRACTION ERROR"))
    print(f"\n  -> {csv_path.name}: {len(rows)} questions, {errors} extraction errors")
    if passage_map:
        missing = [q for q in questions if q["subject"] == "english"
                   and q["set_num"] and q["set_num"] not in passage_map]
        if missing:
            missing_sets = sorted({q["set_num"] for q in missing})
            print(f"  NOTE: Passage text not found for set(s): {missing_sets}")
            print(f"        ELA answers for those sets may need manual review.")


# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Extract SHSAT test questions from PDFs using Claude vision"
    )
    parser.add_argument("--test", choices=["A", "B", "C", "D"], help="Process one test (default: all)")
    parser.add_argument("--dpi", type=int, default=200, help="Render DPI (default: 200)")
    args = parser.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY environment variable is not set.")
        print("  Windows: set ANTHROPIC_API_KEY=sk-ant-...")
        print("  Mac/Linux: export ANTHROPIC_API_KEY=sk-ant-...")
        sys.exit(1)

    to_run = [args.test] if args.test else ["A", "B", "C", "D"]

    for letter in to_run:
        process_test(letter, api_key, args.dpi)

    print("\n\nAll done. Next step:")
    print("  python scripts/import_to_supabase.py")


if __name__ == "__main__":
    main()
