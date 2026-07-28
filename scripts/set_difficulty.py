#!/usr/bin/env python3
"""
Assign difficulty (easy/medium/hard) to imported SHSAT questions using Claude Haiku 4.5.
Reads from extracted CSVs, calls Claude to rate each question, patches Supabase.

Usage:
  set ANTHROPIC_API_KEY=sk-ant-...
  set SUPABASE_URL=https://xxiwyxrkdxlstvcqcjkb.supabase.co
  set SUPABASE_SERVICE_ROLE_KEY=eyJ...
  python scripts/set_difficulty.py
  python scripts/set_difficulty.py --test A
"""

import argparse
import csv
import json
import os
import sys
import time
from pathlib import Path

import requests

OUT_DIR = Path(__file__).parent / "output"
CLAUDE_URL = "https://api.anthropic.com/v1/messages"

TESTS = {
    "A": "STA",
    "B": "STB",
    "C": "STC",
    "D": "STD",
}

PROMPT = """\
You are rating the difficulty of an SHSAT practice question for a New York City middle school student preparing for the Specialized High School Admissions Test.

Subject: {subject}
Type: {q_type}
Question: {text}
{choices_block}Correct answer: {answer}

Rate the difficulty as exactly one word — easy, medium, or hard:

easy   = tests one straightforward concept; most prepared students get it right
medium = requires a non-obvious step, careful reading, or 2-step reasoning
hard   = multi-step logic, tricky wording, or concept likely to trip up students

Reply with only one word: easy, medium, or hard"""


def call_haiku(api_key: str, row: dict) -> str:
    choices_lines = []
    for letter, col in [("A", "choice_1"), ("B", "choice_2"), ("C", "choice_3"), ("D", "choice_4")]:
        val = (row.get(col) or "").strip()
        if val:
            choices_lines.append(f"  {letter}. {val}")

    extra = {}
    try:
        extra = json.loads(row.get("extra_data") or "{}")
    except Exception:
        pass
    if extra.get("choice_5"):
        choices_lines.append(f"  E. {extra['choice_5']}")
    if extra.get("choice_6"):
        choices_lines.append(f"  F. {extra['choice_6']}")

    choices_block = ("Choices:\n" + "\n".join(choices_lines) + "\n") if choices_lines else ""

    prompt = PROMPT.format(
        subject=row.get("subject", ""),
        q_type=row.get("type", ""),
        text=(row.get("text") or "")[:800],
        choices_block=choices_block,
        answer=row.get("answer", ""),
    )

    body = {
        "model": "claude-haiku-4-5",
        "max_tokens": 10,
        "messages": [{"role": "user", "content": prompt}],
    }

    for attempt in range(1, 4):
        try:
            resp = requests.post(
                CLAUDE_URL,
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json=body,
                timeout=30,
            )
            if not resp.ok:
                raise ValueError(f"HTTP {resp.status_code}: {resp.text[:200]}")
            break
        except Exception as exc:
            if attempt < 3:
                time.sleep(5)
            else:
                raise exc

    raw = resp.json()["content"][0]["text"].strip().lower()
    for word in ("easy", "medium", "hard"):
        if word in raw:
            return word
    raise ValueError(f"Unexpected response: {raw!r}")


def patch_difficulty(supabase_url: str, service_key: str, uid: str, difficulty: str):
    resp = requests.patch(
        f"{supabase_url}/rest/v1/all_questions",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        json={"difficulty": difficulty},
        params={"uid": f"eq.{uid}"},
        timeout=15,
    )
    if not resp.ok:
        raise ValueError(f"Supabase {resp.status_code}: {resp.text[:200]}")


def process_test(letter: str, api_key: str, supabase_url: str, service_key: str):
    source = TESTS[letter]
    csv_path = OUT_DIR / f"questions_{source}.csv"
    if not csv_path.exists():
        print(f"  ERROR: {csv_path} not found — run extract_tests.py first")
        return

    ckpt_path = OUT_DIR / f"difficulty_{source}.json"
    checkpoint: dict = {}
    if ckpt_path.exists():
        try:
            checkpoint = json.loads(ckpt_path.read_text(encoding="utf-8"))
        except Exception:
            pass
        if checkpoint:
            print(f"  Resuming ({len(checkpoint)} already done)")

    with open(csv_path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    print(f"\nTest {letter} ({source}): {len(rows)} questions")

    updated = 0
    errors = 0

    for row in rows:
        uid = row["uid"]
        if uid in checkpoint:
            print(f"  {uid} [cached: {checkpoint[uid]}]")
            continue

        print(f"  {uid} ...", end=" ", flush=True)

        try:
            difficulty = call_haiku(api_key, row)
            patch_difficulty(supabase_url, service_key, uid, difficulty)
            checkpoint[uid] = difficulty
            ckpt_path.write_text(json.dumps(checkpoint, indent=2, ensure_ascii=False), encoding="utf-8")
            print(difficulty)
            updated += 1
        except Exception as exc:
            print(f"ERROR: {exc}")
            errors += 1

        time.sleep(0.3)

    print(f"  -> {updated} updated, {errors} errors")


def main():
    parser = argparse.ArgumentParser(description="Set difficulty for SHSAT questions via Claude Haiku 4.5")
    parser.add_argument("--test", choices=["A", "B", "C", "D"], help="Process one test only")
    args = parser.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()

    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not set")
        sys.exit(1)
    if not supabase_url or not service_key:
        print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)

    to_run = [args.test] if args.test else ["A", "B", "C", "D"]
    for letter in to_run:
        process_test(letter, api_key, supabase_url, service_key)

    print("\nDone. Review difficulty assignments in Admin → Questions (filter source=STA/STB/STC/STD).")


if __name__ == "__main__":
    main()
