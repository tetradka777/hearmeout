# Social music implementation plan

> **For agentic workers:** Execute the independent backend tasks in parallel; root integrates and verifies the full feature.

**Goal:** Implement the approved album exchange and music diary in the existing HearMeOut application.

**Architecture:** Server-only private tables and authenticated routes; client screens reuse the catalog, JSON cache, components and SPA history. Swaps isolate blind scores from public ratings; diary reads enforce per-entry visibility.

**Tech Stack:** Existing Next.js 16, React 19, TypeScript, Supabase Postgres.

**Spec:** ../specs/2026-11-12-social-music.md

## Global constraints
- Preserve all owner changes; no new dependencies, automatic notifications, Spotify bulk requests, or destructive migrations.
- UI lowercase English and all four locales. Scoped CSS appended to rev15.css with CRLF.
- Schema changes only via numbered files and MCP on bqpefjulgoyeiktcaxzx.

## Review focus
- Private diary cannot be read by changing userId, after unfriending, or through anon REST.
- Swap participant scores/reactions cannot leak before both finish, including list responses.
- Two simultaneous creates/finishes/pick changes cannot violate the pair or reveal state.
- Navigation/reload preserves entity and ownership context; cached responses cannot cross accounts.
- Long names/notes and missing images/errors do not overlap actions at mobile widths.

### Task 1: server diary
Files: migration_036_music_diary.sql, lib/musicDiary.ts and tests, app/api/diary/route.ts. Contract: camel-case DiaryEntry and authenticated paginated GET, owner POST/PATCH/DELETE. Consume root's cached album metadata helper. Write failing validation/privacy tests, implement, prove green. Root applies migration after review.

### Task 2: server exchange
Files: migration_037_album_swaps.sql, lib/albumSwaps.ts and tests, app/api/album-swaps/route.ts. Contract: participant-oriented SwapView, shared list/single GET and create/pick/finish/cancel mutations. Only received albums are scored; both-finished is atomic. Write failing masking/state/concurrency tests, implement, prove green. Root applies migration after review.

### Task 3: client integration
Files: AppContext, types, AppShell, Shell NAV_GROUP, new DiaryScreen/AlbumSwapScreen, picker/entry-point cards, Match/Profile/Friend/Rate/Home integrations, four locale files and rev15.css. Add explicit entity-aware URL/history fields. Match selected-friend card; Home active swap card. Diary count/last-entry card uses bounded summary; compose from album. Exercise cache invalidation, errors, empty states and safe unsaved edits.

### Task 4: integration and release
- [ ] Review migrations, confirm target, apply exact files through MCP and verify tables/RLS.
- [ ] Run backend/unit tests and two-participant browser scenarios with cleanup of only generated test rows.
- [ ] Check 390/1280, light/dark, back/reload, long content and no extra Spotify searches on mount.
- [ ] Run tsc, full test suite, lint and production build; obtain independent review and resolve material findings.
- [ ] Stage only owned files, commit, merge to main and push under existing authorization; record migrations/commit in CLAUDE.md and verify live assets.
