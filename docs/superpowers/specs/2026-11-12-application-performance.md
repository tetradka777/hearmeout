# Application performance

Speed up startup, repeat visits, navigation and playback while preserving the current design, real data, privacy and account boundaries. Keep drafts and scroll positions on visited screens. No new dependencies, database migrations or paid services.

Measured causes:
- Friend cards requested six-month statistics that no consumer used.
- Pagination fetched an entire parallel wave even for short results.
- Account bootstrap repeated users and friendship reads.
- Audio progress invalidated every player-context consumer.
- Player visibility scanned the document on scroll and twice a second.
- Decorative images and shelf pagination bypassed viewport loading.
- Deep links mounted Home solely to populate the ticker.
- Cache serialization ran synchronously during interaction, and large profile bootstrap responses were excluded from persistence.

Implementation boundaries: use the existing shared caches, authentication and Spotify request wrappers. Warm navigation code only on user intent, without mounting screens or fetching their data. Keep total persisted API storage bounded to three million characters, excluding diary and album exchanges. Clear previous-account collections when the server confirms another owner. Preserve optional-column fallbacks and public-profile restrictions.

Validation: deterministic query-count and privacy tests; browser navigation, layout and playback checks; types, unit tests, lint and production build. Development timing does not establish production cold-start performance or Spotify quota use. Real Safari and Render cold starts require separate verification.
