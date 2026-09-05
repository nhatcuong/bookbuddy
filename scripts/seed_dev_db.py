#!/usr/bin/env python3
"""
Seeds the dev build's local SQLite database from real book export files in
scripts/seed-data/*.json (same shape produced by the app's own Export
feature — see BookBackup in src/services/bookBackup.ts), so UI states can
be tested with realistic content instead of hand-typed notes.

Wipes existing books/sessions on every run, so seeding is repeatable.

Usage: boot the iOS Simulator and launch the dev build at least once (so
bookbuddy.db exists), then run: npm run seed

To add more seed data: drop any exported book JSON into scripts/seed-data/.
"""
import json
import re
import sqlite3
import subprocess
import sys
from pathlib import Path

BUNDLE_ID = "com.nnc.syntopico.dev"
SEED_DATA_DIR = Path(__file__).parent / "seed-data"


def find_db_path() -> Path:
    booted = subprocess.run(
        ["xcrun", "simctl", "list", "devices", "booted"],
        capture_output=True, text=True, check=True,
    ).stdout

    device_id = None
    for line in booted.splitlines():
        if "(Booted)" in line:
            match = re.search(r"\(([0-9A-Fa-f-]{36})\)", line)
            if match:
                device_id = match.group(1)
                break
    if not device_id:
        sys.exit("No booted simulator found — start the dev build first (npx expo run:ios).")

    container = subprocess.run(
        ["xcrun", "simctl", "get_app_container", device_id, BUNDLE_ID, "data"],
        capture_output=True, text=True,
    )
    if container.returncode != 0:
        sys.exit(f"Could not find the app container for {BUNDLE_ID}. Launch the dev build at least once first.")

    container_path = Path(container.stdout.strip())
    matches = list(container_path.rglob("bookbuddy.db"))
    if not matches:
        sys.exit(f"Could not find bookbuddy.db under {container_path} — launch the app once first.")
    return matches[0]


def seed(db_path: Path):
    files = sorted(SEED_DATA_DIR.glob("*.json"))
    if not files:
        sys.exit(f"No seed files found in {SEED_DATA_DIR}")

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("DELETE FROM reading_sessions")
    cur.execute("DELETE FROM books")

    total_sessions = 0
    for path in files:
        data = json.loads(path.read_text())
        book = data["book"]
        cur.execute(
            """INSERT INTO books (title, author, isbn, google_books_id, cover_url, description, page_count)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                book["title"],
                book.get("author"),
                book.get("isbn"),
                book.get("googleBooksId"),
                book.get("coverUrl"),
                book.get("description"),
                book.get("pageCount"),
            ),
        )
        book_id = cur.lastrowid

        for session in data["sessions"]:
            note = session.get("note")
            cur.execute(
                """INSERT INTO reading_sessions (book_id, chapter, raw_transcript, note, session_date)
                   VALUES (?, ?, ?, ?, ?)""",
                (
                    book_id,
                    session.get("chapter"),
                    session.get("rawTranscript"),
                    json.dumps(note) if note is not None else None,
                    session["sessionDate"],
                ),
            )
            total_sessions += 1

        print(f'Seeded "{book["title"]}" — {len(data["sessions"])} sessions')

    conn.commit()
    conn.close()
    print(f"Done. {len(files)} book(s), {total_sessions} session(s) total. Reload the app to see them.")


if __name__ == "__main__":
    db_path = find_db_path()
    print(f"Seeding {db_path}")
    seed(db_path)
