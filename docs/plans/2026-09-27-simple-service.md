# Simple Service Implementation Plan

**Goal:** Rebuild the approved worship presentation workspace in vannaenae/simpleservice.
**Architecture:** A browser-based React application with local persistence and a separate, synchronized projector window. Library data and live output are separate so selecting a song never unexpectedly changes the audience screen.
**Tech Stack:** React, TypeScript, Vite, CSS, Vitest, browser SpeechRecognition and BroadcastChannel.

## Approved direction

Carry forward the user's approved library / slides / service / output workspace. Warm ivory, forest green, apricot and lavender accents; large readable typography; clear operator controls. Build independently rather than transplanting the unrelated current Rhema desktop code. Desktop output uses a movable browser window and fullscreen; automatic monitor selection is not universally supported.

## Tasks

1. Create src/library.test.ts with import validation, XML handling, duplicate detection and lyric matching cases. Run tests to establish missing behavior, then implement src/library.ts and public-domain starter songs in src/seeds.ts.
2. Build src/App.tsx and src/styles.css: search/filter library, editable songs, service order and reordering, preview, explicit send-live, previous/next, themes, projector aspect ratios, font sizing, blackout, stage output, settings, backups, import review, microphone-assisted matching.
3. Implement src/Projector.tsx with live state sync, initial snapshot, heartbeat and fail-safe blanking when the controller disappears. Keep browsing/preview separate from on-air data.
4. Validate with npm test, npm run typecheck, npm run build and browser interaction checks, including projector synchronization and import/error flows. Capture a screenshot.
5. Document supported formats and real limitations in README.md. Commit, push branch and open a pull request in the requested repository.

## Boundaries

No fabricated audio recognition or CCLI connection. Match recognized words against locally stored lyrics; require operator confirmation. Include only traditional public-domain lyrics. Import text, Simple Service JSON, OpenLyrics XML and OpenSong XML. Proprietary EasyWorship/FreeWorship databases and packed schedules need an exported interchange format; reject unsupported binary files explicitly. Store CCLI metadata and a church licence number, with an external SongSelect link; no credential collection or scraping.
