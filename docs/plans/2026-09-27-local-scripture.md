# Local Scripture Listening Implementation Plan

**Goal:** Add the approved offline microphone → Whisper → local Bible detection → operator preview workflow, using Rhema's whisper.cpp approach.
**Architecture:** A loopback-only Node companion manages a pinned whisper.cpp server and a downloaded local model. Browser audio is encoded as 16 kHz PCM WAV chunks and sent only to the local companion. A bundled public-domain World English Bible supports exact/spoken/contextual references and quotation search in the browser. Detected verses load preview on explicit operator selection, then existing Send live presents them.
**Tech Stack:** whisper.cpp v1.8.2, Whisper small.en Q5_1, Node 22+, React, TypeScript, AudioWorklet, local WEB data.

1. Add reproducible setup script: pinned upstream commit and verified model SHA256, local ignored cache, actionable prerequisite failures. Run on this Mac; compile native Whisper with Metal.
2. Add bounded local server: status endpoint, sequential transcription, WAV validation, loopback host/origin checks, native-process lifecycle, production static hosting. Configure Vite proxy and npm local commands.
3. Bundle attributed WEB Bible. Add tests for spoken number normalization, explicit references, book aliases, contextual follow-up, invalid references, quotation matching and silence/non-scripture rejection. Implement deterministic reference/quotation detection; no invented verse text or claimed semantic model.
4. Add persistent Scripture workspace with device selection, actual audio level, transcript, detections, manual verse search, preview and Send live. Use one in-flight audio chunk, bounded overlapping capture and cancellation/cleanup. Never use browser SpeechRecognition for this flow.
5. Test complete transcription with generated spoken audio, then Bible matching and real browser flows. Verify offline inference, stop cleanup, projector sync, typecheck, build and CI. Document initial downloads, actual limitations, and larger model override.
6. Update existing PR #1 in the user's repository. Do not merge or deploy without a user request.

## Implemented and verified

- Three-second capture windows every two seconds replace the initial six-second design.
- Pending references bridge split book/chapter/verse speech; connectors and verse numbers are parsed explicitly.
- Transcript overlap is removed before relative navigation. Preview follows the active reference independently of suggestion deduplication.
- 34 frontend tests and 3 helper tests pass; production build passes; production npm audit reports no vulnerabilities.
- Local Whisper audio test: overlapping three-second speech windows yielded “John, Chapter 3” followed by “Chapter 3 verse 16”; final detected reference was John 3:16. Warm processing measured 326 ms and 313 ms on this computer (not a latency guarantee).
- In-app browser verified spoken-form search and exact Romans 8:28 preview. A live sound-desk service test remains hardware-dependent.
