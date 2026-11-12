# Christmas shelf implementation plan

Goal: seasonal Home track row with no new application API calls on browsing.
Spec: docs/superpowers/specs/2026-11-12-christmas-shelf.md. Work in current checkout on feature branch per project instructions; protect existing user changes.

- [x] Test local calendar boundaries Nov14/15, Jan7/8, year wrap, UTC offset and clock wake-up; then implement seasonal clock.
- [x] Verify static Spotify metadata and covers; create lazily loaded track shelf with existing previews/full Spotify links, insert after friends, append scoped CSS and four locale keys.
- [x] Types/unit/lint/build; browser390/1280 light/dark and360/430/900, horizontal scrolling, season visibility and zero browsing Spotify/API requests. Read-only review. Remove temporary QA fixtures.
- [x] Explicit files commit, journal, merge/push per authorization; verify live assets.
