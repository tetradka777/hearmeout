import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { upstreamErrorResponse } from '@/lib/upstreamError';
import { deezerGet } from '@/lib/deezerServer';
import { storeSpotifyCache, withSpotifyCache } from '@/lib/spotifyCache';
import { fetchSpotifyAlbumDetail, fetchSpotifyTrackIsrc, searchSpotifyTracks } from '@/lib/spotifyCatalog';

// 30-second previews come from Deezer, looked up on the server (no CORS
// proxy). Finding the right recording is the whole job here: a loose
// keyword search used to play another track of the album, or a track by a
// different artist with a similar name ("Miley" → Miley Cyrus).

type DeezerTrack = { id: number; title: string; preview: string; artist?: { name?: string } };
type Hit = { id: number; title: string; preview: string };

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
    const albumId = SPOTIFY_ID.test(album) ? album : '';
    const result = await previewFor(artist, title, albumId);
    if (!result) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    // Deliberately no Cache-Control: an edge cache that only looks at the
    // path (not the query string) would serve one preview for every track.
    return NextResponse.json(result);
  } catch (err) {
    return upstreamErrorResponse(err, '/api/deezer/preview');
  }
}

// Which Deezer track a song is, found once and kept 90 days (no match: 3
// days) — the search below takes two to six requests, some of them
// Spotify's. Its preview link is signed for 15 minutes, so the link itself
// is asked of Deezer (one request) and kept 10 minutes in memory.
type Found = { id: number; title: string };
const linkMemo = new Map<number, { at: number; link: Promise<{ title: string; preview: string } | null> }>();
const LINK_MS = 10 * 60 * 1000;

function rememberLink(id: number, link: Promise<{ title: string; preview: string } | null>): void {
  linkMemo.set(id, { at: Date.now(), link });
  link.catch(() => linkMemo.delete(id));
  if (linkMemo.size > 3000) linkMemo.delete(linkMemo.keys().next().value!);
}

async function previewFor(artist: string, title: string, albumId: string): Promise<{ title: string; preview: string } | null> {
  const key = `dz-preview-id:v1:${albumId}|${artist.toLowerCase()}|${title.toLowerCase()}`;
  let searched = false;
  const found = await withSpotifyCache<Found>(key, 90 * 86400, async () => {
    searched = true;
    const hit = await findPreview(artist, title, albumId);
    if (!hit) return { id: 0, title: '' };
    rememberLink(hit.id, Promise.resolve({ title: hit.title, preview: hit.preview }));
    return { id: hit.id, title: hit.title };
  });
  if (!found.id) {
    // A miss is tried again sooner: Deezer may add the track.
    if (searched) await storeSpotifyCache(key, found, 3 * 86400).catch(() => {});
    return null;
  }
  const memo = linkMemo.get(found.id);
  if (memo && Date.now() - memo.at < LINK_MS) return memo.link;
  const link = deezerGet<DeezerTrack>(`/track/${found.id}`).then((t) => (t.preview ? { title: t.title, preview: t.preview } : null));
  rememberLink(found.id, link);
  const out = await link;
  // The track lost its preview (or is gone): look it up afresh next time.
  if (!out) await storeSpotifyCache(key, { id: 0, title: '' }, 86400).catch(() => {});
  return out;
}

// 1) The exact recording: the Spotify track (from its album's track list,
//    or a search matching both artist and title) → its ISRC → the same
//    recording on Deezer. 2) Otherwise a Deezer search where both the
//    artist and the title must match. Never "something by a similar
//    artist" or "the album's first track": no preview beats a wrong one.
async function findPreview(artist: string, title: string, albumId: string): Promise<Hit | null> {
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

async function previewByIsrc(artist: string, title: string, albumId: string): Promise<Hit | null> {
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
  return dz?.preview ? { id: dz.id, title: dz.title, preview: dz.preview } : null;
}

// exact: the whole title must match, not just its core (so "Song (Live)"
// doesn't pass for "Song").
async function previewBySearch(artist: string, title: string, exact = false): Promise<Hit | null> {
  for (const q of [`artist:"${artist}" track:"${title}"`, `${artist} ${title}`]) {
    const data = await deezerGet<{ data?: DeezerTrack[] }>(`/search?q=${encodeURIComponent(q)}&limit=15`);
    const hit = (data.data || []).find((t) => t.preview && (exact ? normalize(t.title) === normalize(title) : sameTitle(t.title, title)) && sameArtist([t.artist?.name || ''], artist));
    if (hit) return { id: hit.id, title: hit.title, preview: hit.preview };
  }
  return null;
}
