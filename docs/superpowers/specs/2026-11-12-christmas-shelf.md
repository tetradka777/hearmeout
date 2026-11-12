# Seasonal Christmas shelf

Goal: a festive horizontal track shelf on Home, between friends and daily cards, automatically present Nov15–Jan7 inclusive using the visitor local calendar. Title christmas all around, subtitle user-provided i feel it in my fingers / i feel it in my toes. Dates/title are implementation choices announced to owner; no repeated confirmation per standing instructions.

Approaches: fetching Spotify playlists live adds API calls and dev-mode availability constraints; cached server search still adds unnecessary catalogue lookups. Chosen: verified editorial Spotify track metadata bundled like the existing static album catalogue, lazy-loaded only during season. No new API route, DB, dependencies or background Spotify calls. Existing lazy CoverArt, Shelf and PreviewButton; full track link opens Spotify. Preview lookup only on existing play/hover interaction, no fake playback.

Original artwork/title/artist and exact track links verified against Spotify public pages/oEmbed. Keep track IDs separate from PlayerContext.spotifyId, which means album ID. Accessible horizontal row, token colours, no emoji, four locales. Outside season zero section/placeholder and no seasonal payload; date transitions update without reload, visibility return handles sleeping tabs. Header inherits existing accent dot.

Preview scope: one chosen song per gesture, no automatic lookup of other seasonal tracks on unavailable preview. Only foreground covers load lazily; no eager background artwork.
