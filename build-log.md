# Build Log

## Session 11 — 2026-06-06

### What we did
- **T19: Visual redesign** (PR #13)
  - Installed `expo-blur` + `@expo-google-fonts/newsreader`
  - `src/tokens.ts` — single source of truth for all design tokens
  - `src/components/Fab.tsx` — icon-free navy disc, breathe+glow at rest, accent+pulse when recording, reduced-motion aware
  - `src/components/RecordingOverlay.tsx` — unified BlurView overlay: contextual label, 56px tabular timer, 5-bar waveform, processing spinner
  - `src/components/NoteBlocksRenderer.tsx` — accent blue border on quotes, Newsreader italic, uppercase location caption
  - `src/components/UnifiedPrompt.tsx` — navy-tinted BlurView, Newsreader heading, reuses Fab
  - `src/screens/HomeScreen.tsx` — serif/italic wordmark, redesigned book cards, accent dot on active row
  - `src/screens/BookScreen.tsx` — larger cover, chapter in Newsreader italic accent, highlight glow
  - `App.tsx` — loads 6 Newsreader font variants, returns null until ready

### Decisions made
- FAB is icon-free: breathe+glow invites the tap; color shift + overlay carry the "recording" meaning
- Clothbound placeholder covers deferred — `#C8BFAF` warm beige for now, sufficient for MVP
- pre-existing TS errors in VoiceCaptureScreen/identifyBook not touched (out of scope)

### Next session
- Build dev app, test T19 on device (fonts, FAB animation, overlay, all screens)
- Merge PR #13 if it looks good

---

## Session 10 — 2026-06-05

### What we did
- **Claude Design prompt for T19/T20** — drafted the full visual redesign brief
  - Finalized color palette from Bb logo: navy `#1B2A4A` (primary), light blue `#7BA7C9` (accent), white/off-white bg; red `#E53935` fully removed
  - Decided on 4 screens to mockup: Home (book shelf), Book (sessions + note cards), Recording overlay, Retry prompt ("Sorry, what book was that?")
  - Recording overlay: unified blur/dim experience across Home and Book screens — contextual label transitions recording → transcribing → identifying → saving
  - FAB without red: mic icon + pulse ring + overlay label + active color shift to accent blue together replace the red "record" convention
  - Find mode: deferred entirely — FAB stays pure record; Find will be a header search icon (voice-first) when built in a future phase
  - Timeline view: confirmed as Phase 2 — book shelf stays as home screen (better empty state, motivating collection feel)

### Decisions made
- Find mode has no UI presence yet — no toggle above FAB, no second button
- Book shelf (not timeline) stays as the home screen; timeline is a secondary view once there's enough data
- FAB color convention: rely on icon + motion + overlay, not color alone
- Claude Design prompt is ready to paste — user will submit it next session

### Next session
- Build dev app, test T19 on device (fonts, FAB animation, overlay, all screens)
- Merge PR #13 if it looks good

---

## Session 9 — 2026-05-29/30

### What we did
- **T12/T13: Re-record and delete note actions** (PR #12)
  - New `deleteSession(sessionId)` in `database.ts`
  - Expanded sessions now show three actions: **Wrong book?** (left) · **Re-record** · **Delete** (right)
  - Re-record: stores old session id in `rerecordRef`, calls `start()` immediately, deletes old session in `onComplete`
  - Delete: confirmation alert → `deleteSession` → reload
  - Both verified working on device
- **Production build**
  - Resolved provisioning profile error: built once from Xcode GUI to regenerate profile, then switched to terminal
  - `SENTRY_DISABLE_AUTO_UPLOAD=true` must be passed at shell level (not picked up from `.env` by Xcode)
  - Dev and production builds coexist on device (`com.nnc.bookbuddy.dev` vs `com.nnc.bookbuddy`)
  - Production build: `npx expo prebuild --platform ios --clean` then `SENTRY_DISABLE_AUTO_UPLOAD=true npx expo run:ios --configuration Release`
  - Profile trust required on device after each new bundle ID install

### Next session
- T19/T20: Claude Design briefs + visual redesign — last step before daily use

---

## Session 8 — 2026-05-27

### What we did
- **Refactor `useRecording.ts`** — separated abstraction layers per Ousterhout
  - Extracted module-level helpers: `saveAudioFile`, `findOrCreateBook`, `recordingErrorMessage`
  - Extracted named inner functions: `processTranscript` (4 cases as flat early-returns), `resolveWithRetry` (retry loop isolated)
  - `start()` reduced to 10 lines; `stop()` reads as 5 named steps
  - `resolved` flag variable and `!` assertions eliminated; console.log scaffolding removed
- **Fix Google Books cover selection** (PR #11)
  - Old logic picked purely by title similarity → non-deterministic when editions scored equally, could return old/obscure covers
  - New composite score: title similarity (primary) + thumbnail bonus (+0.15) + ratings count bonus (up to +0.1)
  - Popular canonical editions consistently preferred over old ones
  - `maxResults` bumped 5 → 8 for more candidates; extracted `pickBest()` + `itemScore()`
  - Motivated by "Thinking in Systems" repeatedly returning an old edition cover

### Decisions made
- Dropped T09 barcode scan — useless for Kindle (majority of use), friction for physical books
- Revised T09 to cover photo → Claude Vision only (simpler, works for Kindle screens)
- Dropped T11 multi-candidate picker — the real cover problem was edition selection, not ambiguous titles; fixed directly in `googleBooks.ts`
- Revised plan to MVP: fix covers → T12/T13 edit note → T19/T20 Claude Design → ship to self

### Next session
- T12: `updateSession` DB function
- T13: Edit note screen

---

## Session 7 — 2026-05-23

### What we did
- **T04/T05: NoteBlocksRenderer + BookScreen wiring**
  - New `src/components/NoteBlocksRenderer.tsx`: thought blocks as plain text, quote blocks with red left-border accent + italic text + location caption
  - `collapsed` prop for list rows renders a flat 2-line preview
  - `BookScreen.tsx`: replaced `flattenBlocks()` with `NoteBlocksRenderer`; confirmed quote layout working on device
- **T07: UnifiedPrompt component** — new `src/components/UnifiedPrompt.tsx`
  - Full-screen modal overlay with message, tap-to-listen mic button, optional secondary action + cancel
  - Handles its own recording + transcription (expo-audio + Whisper); calls `onTranscript(text)` when done
- **T08: No-book retry flow** — replaces the Alert crash in `useRecording`
  - When null title + no books: hook suspends via Promise (`awaitRetry`), exposes `retryPrompt` state and `provideRetryTranscript` to the screen
  - HomeScreen renders UnifiedPrompt when `retryPrompt !== null`; dismissing calls `provideRetryTranscript(null)` → note silently discarded
  - Up to 2 spoken attempts ("Sorry, what book was that?" → "I still couldn't identify it. Try again?") before discarding
  - "Take a photo instead" deferred to T09
- **T06: "Wrong book?" button** — in BookScreen expanded session view
  - `wrongBookSessionId` state + UnifiedPrompt rendered when set
  - On transcript: `extractBookInfo` → find/create correct book → `reassignSession` → navigate to new book (or reload if same)
  - New DB function `reassignSession(sessionId, newBookId)`
- Tests: updated 2 tests to match T08 behavior (no Alert → retryPrompt pattern); added retryPrompt assertion

### Next session
- T09: PhotoFallback — camera + barcode scan + Claude Vision for book identification; wire "Take a photo instead" into T08
- Or T12/T13: edit note screen (independent, lower risk)

---

## Session 6 — 2026-05-19

### What we did
- **T03: Quote extraction in Claude prompt** — `extract.ts` now returns `NoteBlock[]` instead of a flat string
  - `ExtractedNote.note: string` → `ExtractedNote.blocks: NoteBlock[]`
  - `extractNoteOnly` return type: `{ chapter, note }` → `{ chapter, blocks }`
  - Both Claude tool schemas updated: `note` field replaced by `blocks: NoteBlock[]` array
  - Prompt instructs Claude to detect "quote ... end quote" / "open quote ... close quote" → `{ type: 'quote' }` blocks; everything else → `{ type: 'thought' }` block
  - `database.ts` `insertReadingSession`: removed the manual `[{ type: 'thought', text: extracted.note }]` wrap — now uses `extracted.blocks` directly
  - `useRecording.ts`: destructures `blocks` instead of `note` for both pinned and unpinned paths
  - Tests: updated mocks + assertions; added new quote block test case (5 → 9 in extract.test.ts)
  - Also fixed `useRecording.test.ts` pre-existing breakages from SDK 55 migration: `expo-av` → `expo-audio` mock, `getBooks` → `getBooksByLastSession`, `note` → `blocks` in all mocks
  - All 12 tests pass

### Next session
- T04: `NoteBlocksRenderer` component — replace `flattenBlocks()` in `BookScreen.tsx` with a proper per-block renderer

---

## Session 5 — 2026-05-10 / 2026-05-18

### What we did
- **T02: Note blocks data model** (PR #5)
  - New `src/types/note.ts`: `NoteBlock` union type (`thought | quote`) + `flattenBlocks()` helper
  - `database.ts`: notes now stored as JSON `NoteBlock[]` in the existing `note` column; `getSessionsByBookId` deserializes on read
  - `bookBackup.ts`: export/import format bumped to `version: 2` with `NoteBlock[]` notes
  - `BookScreen.tsx`: uses `flattenBlocks()` until a proper block renderer lands in T04
  - Dropped backward compat after review — fresh app, no migration needed
- **SDK 55 upgrade** (PR #6) — forced by Xcode auto-updating to 26.5
  - Expo SDK 54 native builds are broken on Xcode 26 (fmt library `consteval` errors, SwiftUICore linker errors)
  - Bumped all `expo-*` to `~55.0.0`, `react-native` to `0.83.6`, `@sentry/react-native` to `^8.x`
  - Replaced `expo-av` with `expo-audio`: recording API migrated to `useAudioRecorder` hook
  - Added `expo-audio` to config plugins (provides `NSMicrophoneUsageDescription`) — missing this caused permission call to hang silently
  - Enabled New Architecture (`experiments.newArchEnabled: true`) — required by `expo-audio`
  - Added `SENTRY_DISABLE_AUTO_UPLOAD=true` to avoid sentry-cli org error on every build

### Learnings / gotchas

**Xcode auto-updates break native builds**
Xcode updated itself to 26.5 (iOS 26 SDK). Expo SDK 54 pods were not compatible — multiple native compile failures. Solution: upgrade Expo SDK, not downgrade Xcode.

**expo-audio plugin is required for microphone permissions**
When migrating from `expo-av` to `expo-audio`, the `expo-audio` config plugin must be added to `app.config.js`. Without it, `NSMicrophoneUsageDescription` is missing from Info.plist and `requestRecordingPermissionsAsync()` hangs silently on iOS — no dialog, no error.

**New Architecture required for expo-audio**
`expo-audio` uses `useReleasingSharedObject` from expo-modules-core which requires New Architecture. Disabling it (`newArchEnabled: false`) caused the record button to freeze.

### Next session
- Merge PRs #5 and #6
- T03: Update Claude extraction to return `NoteBlock[]` instead of flat string
- T04: `NoteBlocksRenderer` component

---

## Session 4 — 2026-05-09

### What we did
- Reviewed `tasks.md` and began implementing tasks as stacked PRs
- Installed `gh` CLI via Homebrew for automated PR creation
- **T00: Sentry** (PR #1, merged)
  - `Sentry.init()` in `App.tsx`, enabled only in non-dev builds
  - Added breadcrumbs in `useRecording`: `no_book_identified`, `book_matched`, `book_created`, `recording_completed`, `recording_failed` (with error type)
- **T01: Unit tests** (PR #2, merged)
  - `src/services/__tests__/extract.test.ts` — 6 tests covering `extractBookInfo` and `extractNoteOnly`, mocking `global.fetch`
  - `src/hooks/__tests__/useRecording.test.ts` — 3 tests for last-book fallback, pinned book, and new book flows
  - `jest.setup.ts` for env var stubs
- **flows.md** (PR #3, merged) — authoritative reference for all supported user flows
- **Rename `getBooks` → `getBooksByLastSession`** (PR #4, merged)
  - Went through `getBooksByLastActivity` first (user flagged as too vague)
  - Final name `getBooksByLastSession` — matches `reading_sessions` table and communicates sort order precisely
  - Discussed Philosophy of Software Design: names should communicate behavior, not just identity

### Learnings / gotchas

**Stacked PRs and rebase conflicts**
T01 merged before T00 into main, causing a rebase conflict in `useRecording.ts`. Resolved manually: kept both Sentry breadcrumbs and the renamed function.

**GitHub shows all commits from stacked branches**
When viewing a stacked PR on GitHub, all commits from lower branches appear in the diff. This is cosmetic — only the diff from the base branch matters.

### Next session
- Implement T02: note blocks data model

---

## Session 3 — 2026-05-04

### What we did
- Pushed all code to GitHub (nhatcuong/bookbuddy), set up SSH key
- Set up dev/release build split: `app.config.js` with `APP_VARIANT` env — `com.nnc.bookbuddy.dev` (dev client + Metro) and `com.nnc.bookbuddy` (Release, standalone)
- Installed `expo-dev-client`, resolved `@types/react` peer dep conflict
- Fixed Google Books 503 — retry logic (3x, 2s delay) for 503 + 429
- Installed app on phone via Xcode — Release build is standalone, dev build connects to Metro
- Brainstorming session — designed and saved to memory:
  - Photo fallback for book identification (barcode scan + Claude Vision, one button)
  - Unified prompt interface for "Sorry, what book was that?" retry flow (max 3 attempts, honest drop)
  - Edit note — text box + optional mic dictation, no AI parsing
  - Multi-candidate picker with "None of these → take a photo"
  - Record vs Find — two voice modes, mode toggle above FAB
  - Find — SQLite FTS first, RAG deferred
  - Quote capture — "quote... end quote" → NoteBlock type, page/location metadata
  - Recap/export — MD file + share sheet + pre-filled AI prompt
  - Claude Design — plan to mockup key screens after logic done, UX must make Record/Find unmistakable
  - Sentry — crash reporting + usage counters (T00)
- Wrote `tasks.md` (21 tasks, T00–T20, 7 groups) and `open_questions.md` (10 open questions)

### Next session
- Review `tasks.md`, adjust scope/sequencing
- Implement each task as a separate stacked PR
- Session after: review PRs, merge when happy

---

## Session 2 — 2026-03-18

### What we did
- Built `src/screens/VoiceCaptureScreen.tsx`
  - Record button using `expo-av` `Audio.Recording`
  - Pulse animation ring during recording
  - Live duration counter (mm:ss)
  - On stop: moves file to `documentDirectory/recordings/<timestamp>.m4a`
  - Spinner while transcribing, transcript displayed below button after done
- Built `src/services/whisper.ts` — POSTs audio to OpenAI Whisper API, returns transcript string
- Wired `VoiceCaptureScreen` into `App.tsx`
- Added `.env` for `EXPO_PUBLIC_OPENAI_API_KEY` (gitignored)

### Learnings / gotchas

**expo-file-system legacy API**
In SDK 54, `makeDirectoryAsync` / `moveAsync` moved to `expo-file-system/legacy`. The new API uses `Directory` and `File` classes imported from `expo-file-system` directly. Use `new Directory(Paths.document, 'subdir')` — passing a bare relative path resolves to the system root and throws a permission error.

**Env vars need a server restart**
`EXPO_PUBLIC_*` vars are baked in at bundle time. Changing `.env` requires restarting `node node_modules/expo/bin/cli start`, not just saving and reloading.

### Next session: Step 5 — Book entity extraction
- Send transcript to Claude API (structured output)
- Extract: book title, author (if mentioned), chapter, note
- Display extracted fields for user confirmation
- Handle ambiguous / unrecognized titles

---

## Session 1 — 2026-03-18

### What we did
- Decided on the project concept and phases (see CLAUDE.md)
- Scaffolded an Expo + TypeScript project
- Got the app running on a physical iPhone 15 Plus via Expo Go
- Created the SQLite database schema (books + reading_sessions tables)
- App renders on device with DB initializing on startup

### Learnings / gotchas for future reference

**Expo SDK version hell**
The biggest time sink. `create-expo-app` scaffolds for the latest SDK (55 at the time), but Expo Go on the App Store ships with SDK 54. These must match exactly.
- Always check Expo Go's SDK version first: it tells you on the error screen
- Then set `expo: ~54.0.0` (or whatever matches) and let the local CLI resolve everything else
- Use `node node_modules/expo/bin/cli install <package>` — not `npx expo install` — to get SDK-compatible versions automatically

**React Native version must match the SDK**
Manually pinning `react-native: 0.76.7` caused a `PlatformConstants not found` TurboModule crash.
The fix: check `node_modules/expo/package.json` for the bundled `react-native` version and match it exactly.
For SDK 54: React 19.1.0 + React Native 0.81.5.

**npx expo is broken on Node v25**
`npx expo` fails with `Cannot find module '@expo/cli'` on Node 25.
Workaround: use `node node_modules/expo/bin/cli <command>` directly for everything.

**`--legacy-peer-deps` needed**
npm peer dep resolution fails when mixing React 19 with some Expo packages. Always use `npm install --legacy-peer-deps` if npm errors on install.

### Stack confirmed working
- Expo SDK 54
- React 19.1.0 + React Native 0.81.5
- expo-sqlite, expo-av, expo-file-system, expo-location
- Physical device via Expo Go (no Xcode needed at this stage)
