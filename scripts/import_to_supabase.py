#!/usr/bin/env python3
"""
Import extracted question CSVs into the Supabase all_questions table.
Run this after extract_tests.py has finished.

Requirements: requests (already installed)

Usage:
  cd Chantutor/
  set SUPABASE_URL=https://xxiwyxrkdxlstvcqcjkb.supabase.co
  set SUPABASE_SERVICE_ROLE_KEY=eyJ...
  python scripts/import_to_supabase.py
  python scripts/import_to_supabase.py --test A
  python scripts/import_to_supabase.py --dry-run
"""

import argparse
import csv
import json
import os
import sys
from pathlib import Path

import requests

OUT_DIR = Path(__file__).parent / "output"

TESTS = {
    "A": "25A",
    "B": "25B",
    "C": "25C",
    "D": "25D",
}

BATCH_SIZE = 50


def import_csv(csv_path: Path, supabase_url: str, service_key: str, dry_run: bool):
    rows = []
    skipped = []

    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            uid = row.get("uid", "")

            # Skip rows that failed extraction
            text = row.get("text", "")
            if text.startswith("[EXTRACTION ERROR"):
                skipped.append(uid)
                continue

            # Skip rows with no question text or answer
            if not text.strip() or not row.get("answer", "").strip():
                skipped.append(uid)
                continue

            db_row: dict = {}
            for k, v in row.items():
                if v == "" or v is None:
                    db_row[k] = None
                elif k == "extra_data":
                    try:
                        db_row[k] = json.loads(v)
                    except (json.JSONDecodeError, TypeError):
                        db_row[k] = None
                else:
                    db_row[k] = v

            rows.append(db_row)

    total = len(rows) + len(skipped)
    print(f"  {csv_path.name}: {total} rows read | {len(rows)} to import | {len(skipped)} skipped")

    if skipped:
        print(f"  Skipped UIDs: {', '.join(skipped[:10])}{'...' if len(skipped) > 10 else ''}")

    if dry_run:
        print("  [DRY RUN] First 3 rows:")
        for r in rows[:3]:
            q_preview = (r.get("text") or "")[:70]
            print(f"    {r['uid']} | {r['type']} | {r['subject']} | {q_preview}...")
        return len(rows)

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    imported = 0
    errors = 0

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        resp = requests.post(
            f"{supabase_url}/rest/v1/all_questions",
            headers=headers,
            json=batch,
            params={"on_conflict": "uid"},
            timeout=30,
        )
        if resp.status_code in (200, 201):
            imported += len(batch)
            batch_num = i // BATCH_SIZE + 1
            total_batches = (len(rows) + BATCH_SIZE - 1) // BATCH_SIZE
            print(f"  Batch {batch_num}/{total_batches}: {len(batch)} rows OK")
        else:
            errors += len(batch)
            print(f"  ERROR batch {i // BATCH_SIZE + 1}: HTTP {resp.status_code}")
            print(f"  {resp.text[:300]}")

    print(f"  -> Imported: {imported} | Errors: {errors}")
    return imported


def main():
    parser = argparse.ArgumentParser(
        description="Import extracted SHSAT questions into Supabase"
    )
    parser.add_argument("--test", choices=["A", "B", "C", "D"], help="Import one test only")
    parser.add_argument("--dry-run", action="store_true", help="Preview without inserting")
    args = parser.parse_args()

    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

    if not supabase_url or not service_key:
        print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.")
        print("  SUPABASE_URL is in frontend/.env as VITE_SUPABASE_URL")
        print("  SUPABASE_SERVICE_ROLE_KEY is in the Supabase dashboard → Settings → API")
        sys.exit(1)

    to_run = [args.test] if args.test else ["A", "B", "C", "D"]
    total_imported = 0

    for letter in to_run:
        source = TESTS[letter]
        csv_path = OUT_DIR / f"questions_{source}.csv"
        if not csv_path.exists():
            print(f"ERROR: {csv_path} not found. Run extract_tests.py first.")
            continue
        print(f"\nTest {letter} ({source}):")
        total_imported += import_csv(csv_path, supabase_url, service_key, args.dry_run)

    suffix = " (dry run)" if args.dry_run else ""
    print(f"\nTotal imported{suffix}: {total_imported}")
    if not args.dry_run:
        print("\nNext steps:")
        print("  1. In the Admin panel → Questions, filter by source=25A/25B/25C/25D")
        print("  2. Set difficulty for each question (easy/medium/hard)")
        print("  3. Review and correct any wrong answers")
        print("  4. Change status from 'pending' to 'approved' when ready")


if __name__ == "__main__":
    main()
