# Album exchange and music diary

Approved context: the interactive exchange/diary concepts and the placement proposed in chat; user said “давай бро”.

## Product behavior
- Match: compact exchange card immediately below the selected pair summary; opens a dedicated swap screen for that friend. Home: ordinary card for an active exchange, never a fixed overlay.
- An accepted friend receives the inviter's real album and optional note, then chooses an album in return. One active exchange per unordered pair. Either participant may cancel an unfinished exchange. Each participant rates the album received (0.1–5, tenths), marks listening complete and optionally writes a reaction. The other person's score/reaction stays absent from the API until both finish. These scores never automatically publish ordinary ratings or notifications.
- Profile: music diary entry below listening stats. Album page: add-to-diary action with that album selected. Dedicated diary screen lists entries by chosen listening date and supports create/edit/delete. Each entry has an actual album, moment title (120 chars), note (2000 chars), date, optional mood (calm/nostalgic/energised), privacy (private by default or accepted friends). Friend profile links to their shared entries. No public/stranger reads.
- Existing catalog and durable album cache supply album metadata and images. No Spotify searches on screen mount. A picker starts with loaded/catalog albums; users may open more music through the existing catalogue.
- Existing Match history remains in scope only as the existing behavior; the current implementation request accepts exchange/diary placement. No invented historical percentages or artist causes.

## Technical decisions
- Two new screens (diary, swap) participate in AppContext URLs/history, lazy loading and preserved mounted state; no new main navigation tab.
- Additive migrations 036 (diary) and 037 (swaps). UUID users, RLS enabled, no anon/authenticated policies or grants. Cookie-authenticated Next handlers use service_role and enforce ownership/friendship/participant checks.
- Conditional/atomic database writes prevent duplicate active pairs and concurrent finish/pick races. Hidden fields are omitted or null in server DTOs.
- Shared cached GET for swap list is reused by Home and Match. Diary loads only when opened. Mutations invalidate and update those exact cache keys. No background polling or unsolicited messages.
- No dependencies; palette tokens, scoped rev15.css (CRLF), four locales, existing album/player components. Preserve owner changes.

## Validation
Unit: input bounds, valid calendar dates, privacy/ownership, hidden outcomes, duplicate pair/concurrency state rules. Browser: two test participants complete/cancel exchange, private/shared diary CRUD, outsider denial, reload/back, long text at 390/1280 in both themes. Test-created records are removed; existing records untouched. Full tsc/test/build and relevant lint before commit. Apply migrations to confirmed bqpefjulgoyeiktcaxzx via MCP, verify schema and RLS. Merge/push only ready work under existing authorization.
