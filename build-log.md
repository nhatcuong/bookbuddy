# Build Log

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
