#!/usr/bin/env python3
"""
Verify and fix answers for new SHSAT sample tests A-D (STA/STB/STC/STD).
Compares DB answers against the official 2026-2027 answer key.

Usage:
    set SUPABASE_SERVICE_KEY=<your service key>
    python scripts/verify_answers.py

Outputs SQL UPDATE statements for every mismatch.
Run those statements in the Supabase SQL editor to apply fixes.
"""

import os
import re
import requests

SUPABASE_URL = "https://xxiwyxrkdxlstvcqcjkb.supabase.co"
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_KEY", "")
if not SERVICE_KEY:
    print("ERROR: Set SUPABASE_SERVICE_KEY environment variable before running.")
    raise SystemExit(1)

HEADERS = {
    "apikey":        SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type":  "application/json",
}

# ── Official Answer Key ────────────────────────────────────────────────────────
# ELA_KEY[test_letter][1-based question number] = canonical answer string
# MATH_KEY[test_letter][1-based question number] = canonical answer string
#
# Multi-select answers stored as sorted comma-separated letters, e.g. "A,C"
# Free-response stored exactly as printed in the answer key.

ELA_KEY = {
    "A": {
         1: "B",              2: "B",              3: "D",              4: "C,E",
         5: "C",              6: "A",              7: "Drag Box",       8: "D",
         9: "D",             10: "B",             11: "C",             12: "A",
        13: "B",             14: "C",             15: "C",             16: "B",
        17: "A",             18: "A",             19: "A",             20: "D",
        21: "C",             22: "D",             23: "C",             24: "D",
        25: "D",             26: "A",             27: "B",             28: "A",
        29: "D",             30: "A",             31: "B",             32: "C",
        33: "C",             34: "A",             35: "B",             36: "C",
        37: "C",             38: "D",             39: "A",             40: "B",
        41: "D",             42: "C",             43: "A",             44: "Unfortunately",
        45: "A",             46: "D",             47: "C",             48: "C",
        49: "D",             50: "Sentence 4",
    },
    "B": {
         1: "B",              2: "B",              3: "C",              4: "D",
         5: "D",              6: "C",              7: "A",              8: "B",
         9: "A",             10: "D",             11: "C",             12: "C",
        13: "C",             14: "D",             15: "A",             16: "A",
        17: "D",             18: "D",             19: "A",             20: "C",
        21: "B",             22: "B",             23: "B",             24: "C",
        25: "D",             26: "B",             27: "C",             28: "A",
        29: "A",             30: "B",             31: "A",             32: "C",
        33: "B",             34: "A",             35: "D",             36: "B",
        37: "D",             38: "A",             39: "B",             40: "C",
        41: "A",             42: "A",             43: "Meanwhile",     44: "A",
        45: "B",             46: "D",             47: "Choice A",      48: "C",
        49: "Sentence 2",    50: "C",
    },
    "C": {
         1: "B",              2: "C",              3: "B",              4: "B",
         5: "A",              6: "D",              7: "C",              8: "C",
         9: "A",             10: "D",             11: "B",             12: "A",
        13: "C",             14: "A",             15: "D",             16: "C",
        17: "A",             18: "B",             19: "C",             20: "C",
        21: "A",             22: "A",             23: "B",             24: "D",
        25: "B",             26: "A",             27: "B",             28: "B",
        29: "C",             30: "A",             31: "A",             32: "B",
        33: "D",             34: "C",             35: "A",             36: "B",
        37: "A",             38: "Choice 2,3",    39: "D",             40: "1,4",
        41: "C",             42: "C",             43: "B",             44: "A",
        45: "Choice 1,3",    46: "C",             47: "D",             48: "B",
        49: "C",             50: "D",
    },
    "D": {
         1: "B",              2: "D",              3: "C",              4: "C",
         5: "D",              6: "B",              7: "A",              8: "A",
         9: "C",             10: "B",             11: "C",             12: "B",
        13: "B",             14: "A",             15: "B",             16: "D",
        17: "B",             18: "C",             19: "A",             20: "C",
        21: "A",             22: "D",             23: "B",             24: "D",
        25: "B",             26: "B",             27: "B",             28: "D",
        29: "D",             30: "A",             31: "D",             32: "B",
        33: "C",             34: "C",             35: "B",             36: "D",
        37: "C",             38: "A",             39: "B",             40: "C",
        41: "C",             42: "B",             43: "D",             44: "D",
        45: "C",             46: "B",             47: "A",             48: "Choice 3",
        49: "A,D",           50: "C",
    },
}

MATH_KEY = {
    "A": {
         1: "0.001 inch",          2: "B",                    3: "-4",
         4: "45",                  5: "D",                    6: "A",
         7: "A",                   8: "56 stamps",            9: "x = 162",
        10: "18",                 11: "B",                   12: "B",
        13: "D",                  14: "63",                  15: "B",
        16: "B",                  17: "|1| - |-5|",          18: "A",
        19: "A",                  20: "D",                   21: "B",
        22: "B",                  23: "D",                   24: "C",
        25: "x = 99",             26: "D",                   27: "-4, 28, -56",
        28: "D",                  29: "B",                   30: "C",
        31: "C",                  32: "X = -4 1/3",          33: "B",
        34: "C",                  35: "B",                   36: "B",
        37: "(1,3) (3,9) (4,12)", 38: "D",                  39: "C",
        40: "D",                  41: "C",                   42: "D",
        43: "see picture",        44: "C",                   45: "A",
        46: "D",                  47: "C",                   48: "C",
        49: "A",                  50: "7/5",
    },
    "B": {
         1: "A",
         2: "Survey 47 students, only 12 students like soccer",
         3: "1, 3, 4",            4: "116",                  5: "120",
         6: "A",                  7: "D",                    8: "C",
         9: "C",                 10: "B",                   11: "D",
        12: "B",                 13: "0.4",                 14: "C",
        15: "D",                 16: "Table A & Table C",   17: "X < 16",
        18: "A",                 19: "D",                   20: "C",
        21: "B",                 22: "B",                   23: "B",
        24: "C",                 25: "C",                   26: "B",
        27: "D",                 28: "25π",                 29: "A",
        30: "D",                 31: "C",                   32: "C",
        33: "D",                 34: "B",                   35: "C",
        36: "A",                 37: "C",                   38: "D",
        39: "B",                 40: "3",                   41: "C",
        42: "B",                 43: "C",                   44: "C",
        45: "A",                 46: "Y = 20x + 50",        47: "A",
        48: "D",                 49: "C",                   50: "7/5",
    },
    "C": {
         1: "D",                  2: "B",                    3: "D",
         4: "C",                  5: "4n - 12",              6: "A",
         7: "C",                  8: "A,B,C,E",              9: "C",
        10: "C",                 11: "B",                   12: "0.2",
        13: "D",                 14: "B",                   15: "3",
        16: "B",                 17: "A",                   18: "D",
        19: "C",                 20: "Circle A = 25, Circle C = 5",
        21: "A",                 22: "210 ft",              23: "C",
        24: "B",                 25: "C",                   26: "D",
        27: "C",                 28: "Z = 17w",             29: "0.25",
        30: "C",                 31: "A",                   32: "15/15F",
        33: "A",                 34: "B",                   35: "A = 10B",
        36: "B",                 37: "A",                   38: "A",
        39: "C",                 40: "B",                   41: "4.75n + 12.5 ≤ 35",
        42: "7500 cm³",          43: "A",                   44: "69.12mm, 74.88mm",
        45: "B",                 46: "C",                   47: "B",
        48: "A",                 49: "15, 7, 8",            50: "B",
    },
    "D": {
         1: "B",                  2: "D",                    3: "B",
         4: "C",                  5: "1/25 * 1/100",         6: "B",
         7: "2.50%",              8: "5.86 sq in",           9: "A,B,D",
        10: "A",                 11: "A",                   12: "D",
        13: "A",                 14: "B",                   15: "C",
        16: "0.5",               17: "D",                   18: "C",
        19: "C",                 20: "B",                   21: "C",
        22: "B",                 23: "A",                   24: "B",
        25: "B",                 26: "30 + 18x ≤ 120",      27: "B",
        28: "C",                 29: "B",                   30: "A",
        31: "C",                 32: "B",                   33: "C",
        34: "C",                 35: "C",                   36: "25.60%",
        37: "640",               38: "D",                   39: "C",
        40: "D",                 41: "B",                   42: "B",
        43: "$0.65, $0.5 & $0.15", 44: "C",                45: "$6",
        46: "2,3,4,9",           47: "A",                   48: "C",
        49: "C",                 50: "B",
    },
}

SOURCE_TO_LETTER = {"STA": "A", "STB": "B", "STC": "C", "STD": "D"}


def uid_num(uid: str) -> int:
    m = re.search(r"_Q(\d+)$", uid)
    return int(m.group(1)) if m else 0


def normalize(ans: str) -> str:
    """Normalize for comparison: strip, lowercase, sort multi-select parts."""
    ans = (ans or "").strip()
    if re.search(r"[,&]", ans):
        parts = re.split(r"\s*[,&]\s*", ans)
        parts = [p.strip() for p in parts if p.strip()]
        return ",".join(sorted(p.lower() for p in parts))
    return ans.lower()


def answers_match(db_ans: str, key_ans: str) -> bool:
    return normalize(db_ans) == normalize(key_ans)


def fetch_source(source: str) -> list:
    rows = []
    offset = 0
    while True:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/all_questions",
            headers=HEADERS,
            params={
                "select": "uid,subject,answer,source",
                "source": f"eq.{source}",
                "order": "uid",
                "limit": "200",
                "offset": str(offset),
            },
        )
        if not resp.ok:
            print(f"  ERROR {source}: {resp.status_code} {resp.text[:200]}")
            break
        batch = resp.json()
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < 200:
            break
        offset += 200
    return rows


def main():
    print("Fetching questions from DB...\n")

    mismatches = []
    totals = {"checked": 0, "matched": 0}

    for source, letter in SOURCE_TO_LETTER.items():
        rows = fetch_source(source)
        rows.sort(key=lambda r: uid_num(r["uid"]))

        ela_qs  = [r for r in rows if (r.get("subject") or "").lower() == "english"]
        math_qs = [r for r in rows if (r.get("subject") or "").lower() == "math"]

        print(f"Test {letter} ({source}): {len(ela_qs)} ELA, {len(math_qs)} Math")

        for section_qs, key_dict, section_name in [
            (ela_qs,  ELA_KEY[letter],  "ELA"),
            (math_qs, MATH_KEY[letter], "Math"),
        ]:
            for i, q in enumerate(section_qs):
                q_num = i + 1
                if q_num > 50:
                    print(f"  WARNING: extra {section_name} question at index {i+1} ({q['uid']}) — skipped")
                    continue
                key_ans = key_dict.get(q_num, "")
                db_ans  = (q.get("answer") or "").strip()
                totals["checked"] += 1

                if answers_match(db_ans, key_ans):
                    totals["matched"] += 1
                else:
                    mismatches.append({
                        "uid":        q["uid"],
                        "test":       letter,
                        "section":    section_name,
                        "q_num":      q_num,
                        "db_answer":  db_ans,
                        "key_answer": key_ans,
                    })

    print(f"\nChecked: {totals['checked']}  |  Matched: {totals['matched']}  |  Mismatches: {len(mismatches)}\n")

    if not mismatches:
        print("All answers match the key — nothing to update.")
        return

    print("=" * 70)
    print("MISMATCH REPORT + SQL FIXES")
    print("=" * 70)
    print()

    sql_lines = []
    for m in mismatches:
        correct = m["key_answer"].replace("'", "''")
        print(f"[Test {m['test']} {m['section']} Q{m['q_num']}]  uid={m['uid']}")
        print(f"  DB  : {m['db_answer']!r}")
        print(f"  Key : {m['key_answer']!r}")
        sql = f"UPDATE all_questions SET answer = '{correct}' WHERE uid = '{m['uid']}';"
        sql_lines.append(sql)
        print(f"  SQL : {sql}")
        print()

    print("=" * 70)
    print("COPY-PASTE SQL BLOCK:")
    print("=" * 70)
    print()
    for line in sql_lines:
        print(line)
    print(f"\n-- {len(sql_lines)} updates total")


if __name__ == "__main__":
    main()
