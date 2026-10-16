import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { upstreamErrorResponse } from '@/lib/upstreamError';
import { deezerGet } from '@/lib/deezerServer';
import { withSpotifyCache } from '@/lib/spotifyCache';
import { fetchSpotifyAlbumDetail, fetchSpotifyTrackIsrc, searchSpotifyTracks } from '@/lib/spotifyCatalog';

// 30-second previews come from Deezer, looked up on the server (no CORS
// proxy). Finding the right recording is the whole job here: a loose
// keyword search used to play another track of the album, or a track by a
// different artist with a similar name ("Miley" → Miley Cyrus).

type DeezerTrack = { id: number; title: string; preview: string; artist?: { name?: string } };

// Letters and digits in any script (an ASCII-only version used to erase
// Cyrillic, Japanese, … names, so those tracks never matched), lower case,
// accents dropped.
function normalize(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
// The title without "(feat. …)", "[Live]" or " - Remastered 2009".
function core(s: string): string {
  return normalize(s.replace(/\s*[([].*?[)\]]/g, '').replace(/\s+-\s+.*$/, ''));
}
function sameTitle(a: string, b: string): boolean {
  if (normalize(a) === normalize(b)) return true;
  const ca = core(a);
  return !!ca && ca === core(b);
}
// Exact artist match only: one of the credited artists is the one asked
// for ("Miley" is not "Miley Cyrus").
function sameArtist(candidates: string[], wanted: string): boolean {
  const want = new Set([wanted, ...wanted.split(/\s*,\s*|\s+&\s+/)].map(normalize).filter(Boolean));
  return candidates.some((c) => want.has(normalize(c))) || want.has(normalize(candidates.join(', ')));
}

const SPOTIFY_ID = /^[0-9A-Za-z]{22}$/;

export async function GET(request: NextRequest) {
  // Signed-in only: this calls Spotify/Deezer on the server, and an open
  // endpoint let anyone spend the app's shared API quota.
  if (!(await getCurrentUserId())) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const artist = params.get('artist') || '';
  const title = params.get('title') || '';
  const album = params.get('album') || '';
  if (!artist || !title) return NextResponse.json({ error: 'missing_query' }, { status: 400 });

  try {
    // Preview URLs are signed for 15 minutes, so a found preview is cached
    // for 10 and never served stale.
    const albumId = SPOTIFY_ID.test(album) ? album : '';
    const key = `dz-preview:v2:${albumId}|${artist.toLowerCase()}|${title.toLowerCase()}`;
    const result = await withSpotifyCache(key, 600, () => findPreview(artist, title, albumId), 0);
    if (!result) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    // Deliberately no Cache-Control: an edge cache that only looks at the
    // path (not the query string) would serve one preview for every track.
    return NextResponse.json(result);
  } catch (err) {
    return upstreamErrorResponse(err, '/api/deezer/preview');
  }
}

// 1) The exact recording: the Spotify track (from its album's track list,
//    or a search matching both artist and title) → its ISRC → the same
//    recording on Deezer. 2) Otherwise a Deezer search where both the
//    artist and the title must match. Never "something by a similar
//    artist" or "the album's first track": no preview beats a wrong one.
async function findPreview(artist: string, title: string, albumId: string): Promise<{ title: string; preview: string } | null> {
  // The ISRC route costs Spotify requests (the quota the whole app
  // shares), so a Deezer track with exactly this title by exactly this
  // artist goes first — the same recording in practice. Only when there's
  // none (or just a "(Live)"/"- Remastered" variant) is the exact recording
  // looked up through Spotify, then the looser Deezer match.
  const exactTitle = await previewBySearch(artist, title, true);
  if (exactTitle) return exactTitle;
  try {
    const exact = await previewByIsrc(artist, title, albumId);
    if (exact) return exact;
  } catch {
    // Spotify rate-limited or down: the Deezer search below still works
    // (and reports Deezer's own rate limit if that's the problem).
  }
  return previewBySearch(artist, title);
}

async function previewByIsrc(artist: string, title: string, albumId: string): Promise<{ title: string; preview: string } | null> {
  let trackId: string | null = null;
  if (albumId) {
    const detail = await withSpotifyCache(`album:${albumId}`, 180 * 86400, () => fetchSpotifyAlbumDetail(albumId));
    const list = detail?.tracklist || [];
    trackId = (list.find((t) => normalize(t.title) === normalize(title)) || list.find((t) => sameTitle(t.title, title)))?.id ?? null;
  }
  if (!trackId) {
    const hits = await withSpotifyCache(`sp-trksearch:v1:${artist.toLowerCase()}|${title.toLowerCase()}`, 7 * 86400, () => searchSpotifyTracks(artist, title));
    trackId = hits.find((h) => sameTitle(h.title, title) && sameArtist(h.artists, artist))?.id ?? null;
  }
  if (!trackId) return null;
  const id = trackId;
  const isrc = await withSpotifyCache(`sp-isrc:v1:${id}`, 90 * 86400, () => fetchSpotifyTrackIsrc(id));
  if (!isrc) return null;
  const dz = await deezerGet<DeezerTrack>(`/track/isrc:${encodeURIComponent(isrc)}`).catch(() => null); // not on Deezer
  return dz?.preview ? { title: dz.title, preview: dz.preview } : null;
}

// exact: the whole title must match, not just its core (so "Song (Live)"
// doesn't pass for "Song").
async function previewBySearch(artist: string, title: string, exact = false): Promise<{ title: string; preview: string } | null> {
  for (const q of [`artist:"${artist}" track:"${title}"`, `${artist} ${title}`]) {
    const data = await deezerGet<{ data?: DeezerTrack[] }>(`/search?q=${encodeURIComponent(q)}&limit=15`);
    const hit = (data.data || []).find((t) => t.preview && (exact ? normalize(t.title) === normalize(title) : sameTitle(t.title, title)) && sameArtist([t.artist?.name || ''], artist));
    if (hit) return { title: hit.title, preview: hit.preview };
  }
  return null;
}
