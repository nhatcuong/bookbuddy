# BookBuddy

A voice-first reading companion app for tracking books, capturing reading thoughts, and synthesizing learning over time.

## Core Concept

User speaks naturally after a reading session — e.g. *"Finished chapter 3 of Thinking Fast and Slow today. Interesting but lots of well-known facts. Wonder how applicable in real work environments."*

The app:
1. Detects the book title and chapter from speech
2. Fetches book metadata (title, author, cover, ISBN) automatically
3. Stores the note with date and location
4. Over time, synthesizes the reading experience and surfaces learning

## Phases

**Phase 1 — Voice Journal (MVP)**
- Voice capture → Whisper transcription
- Book entity extraction from natural speech (LLM structured output)
- Auto-fetch book metadata + cover (Google Books API)
- Store notes with date, chapter, location
- Confirmation UX for ambiguous book titles

**Phase 2 — Synthesis**
- Reading recaps per book
- Cross-book learning patterns
- RAG over personal reading notes

**Phase 3 — Conversational**
- Chat with the app about a book
- Book recommendations
- Cross-referencing themes across books

**Phase 4 — Social (deferred)**
- Connect with similar readers
- Treat as a separate product decision, not MVP scope

## Tech Stack Decisions

| Concern | Choice | Rationale |
|---|---|---|
| Mobile framework | React Native + Expo | Best fit for backend engineer new to mobile |
| Voice → text | Whisper API (OpenAI) | On-device Whisper is possible later but premature now |
| LLM / parsing | Cloud API (Claude or OpenAI) | On-device LLM deferred — design interfaces to swap later |
| Book metadata | Google Books API | Free, solid, covers images |
| Local storage | SQLite (via Expo SQLite) | Simple, offline-first |
| Backend (later) | TBD | Not needed for Phase 1 |

## Key Technical Risks

- **Book title extraction from casual speech** is harder than it looks — needs fuzzy matching + LLM normalization + good confirmation UX
- **On-device LLM** is the right long-term direction (privacy, offline) but a costly side project tax early on — defer
- **Mobile learning curve** is the real ramp for this project, not the AI parts

## Principles

- Capture habit must form before synthesis is useful — Phase 1 is the actual product
- Zero friction on input is non-negotiable (voice-first, no manual typing)
- Design AI interfaces to be swappable (cloud → on-device later)
- Social features are a different product — don't let them creep into early scope
- **Always test before moving on** — especially integrations. Do not proceed to the next step until the current one has been verified end-to-end on device.

## Open Questions

- iOS first or cross-platform from day one?
- Local-only data or cloud sync from the start?
- Authentication strategy (if any) for Phase 1
