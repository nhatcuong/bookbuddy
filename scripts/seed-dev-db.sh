#!/bin/bash
# Seeds the dev build's local SQLite database with 2 books and 6 reading
# sessions, for exercising UI states (long/short notes, quotes, a book with
# many sessions to scroll, and one deliberately-null note to preview the
# "processing failed" fallback) without recording real notes by hand.
#
# Usage: boot the iOS Simulator and launch the dev build at least once
# (so bookbuddy.db exists), then run: bash scripts/seed-dev-db.sh
set -euo pipefail

BUNDLE_ID="com.nnc.syntopico.dev"

DEVICE=$(xcrun simctl list devices booted | grep -oE '[0-9A-Fa-f-]{36}' | head -1)
if [ -z "$DEVICE" ]; then
  echo "No booted simulator found — start the dev build first (npx expo run:ios)."
  exit 1
fi

CONTAINER=$(xcrun simctl get_app_container "$DEVICE" "$BUNDLE_ID" data 2>/dev/null) || {
  echo "Could not find the app container for $BUNDLE_ID on the booted simulator."
  echo "Make sure the dev build has been launched at least once."
  exit 1
}

DB_PATH=$(find "$CONTAINER" -name "bookbuddy.db" 2>/dev/null | head -1)
if [ -z "$DB_PATH" ]; then
  echo "Could not find bookbuddy.db under $CONTAINER — launch the app once first so it creates the database."
  exit 1
fi

echo "Seeding $DB_PATH"

sqlite3 "$DB_PATH" <<'SQL'
INSERT INTO books (title, author, isbn, cover_url, page_count) VALUES
  ('Thinking, Fast and Slow', 'Daniel Kahneman', '9780374533557', 'https://covers.openlibrary.org/b/isbn/9780374533557-L.jpg', 499),
  ('Deep Work', 'Cal Newport', '9781455586691', 'https://covers.openlibrary.org/b/isbn/9781455586691-L.jpg', 296);

INSERT INTO reading_sessions (book_id, chapter, raw_transcript, note, session_date) VALUES
  (
    (SELECT id FROM books WHERE title = 'Thinking, Fast and Slow'),
    'Chapter 3',
    'Finished chapter 3 today. There is a line about how a managers output is the output of his organization that I want to remember, on page 42. Interesting how it applies outside of just management.',
    '[{"type":"thought","text":"Interesting how this idea applies outside of just management.","location":null},{"type":"quote","text":"A managers output is the output of his organization.","location":"page 42"}]',
    '2026-08-20 09:00:00'
  ),
  (
    (SELECT id FROM books WHERE title = 'Thinking, Fast and Slow'),
    'Chapter 5',
    'Read chapter 5 on a train this morning. The anchoring effect section was really compelling, made me think about how I negotiate salary.',
    '[{"type":"thought","text":"The anchoring effect section was really compelling, made me think about how I negotiate salary.","location":null}]',
    '2026-08-24 08:15:00'
  ),
  (
    (SELECT id FROM books WHERE title = 'Thinking, Fast and Slow'),
    NULL,
    'This one is a longer note meant to simulate a processing failure so the raw transcript fallback and re-process button are visible for testing without needing a real corrupted note.',
    NULL,
    '2026-08-28 20:30:00'
  ),
  (
    (SELECT id FROM books WHERE title = 'Thinking, Fast and Slow'),
    'Chapter 8',
    'Long session today, covered chapter 8 in full. A few things stood out about overconfidence and the planning fallacy, and a quote about how a plan is a story, not a forecast, worth remembering. Also thinking this connects to how I plan sprints at work.',
    '[{"type":"thought","text":"Overconfidence and the planning fallacy section stood out.","location":null},{"type":"quote","text":"A plan is a story, not a forecast.","location":"page 251"},{"type":"thought","text":"This connects to how I plan sprints at work.","location":null}]',
    '2026-09-01 21:00:00'
  ),
  (
    (SELECT id FROM books WHERE title = 'Deep Work'),
    'Chapter 1',
    'Started reading Deep Work. The idea of deep work as a superpower in a distracted world resonates a lot.',
    '[{"type":"thought","text":"The idea of deep work as a superpower in a distracted world resonates a lot.","location":null}]',
    '2026-08-30 07:45:00'
  ),
  (
    (SELECT id FROM books WHERE title = 'Deep Work'),
    'Chapter 2',
    'Chapter 2 talks about the metric black hole for knowledge work, and theres a line about clarity around what matters providing clarity around what does not, which I want to keep.',
    '[{"type":"quote","text":"Clarity around what matters provides clarity around what does not.","location":"page 51"},{"type":"thought","text":"The metric black hole idea for knowledge work is worth sitting with.","location":null}]',
    '2026-09-02 22:10:00'
  );
SQL

echo "Seeded 2 books, 6 sessions. Reload the app (Cmd+R in the simulator) to see them."
