import { NextRequest, NextResponse } from 'next/server';
import { upstreamErrorResponse } from '@/lib/upstreamError';
import { deezerGet } from '@/lib/deezerServer';
import { withSpotifyCache } from '@/lib/spotifyCache';

// Server-side so it never depends on the public corsproxy.io service the
// client used to call directly — that proxy is flaky enough (rate limits,
// outages) that it was leaving the preview player permanently stuck in
// "loading" for real visitors. A plain server-to-server fetch has no CORS
// restriction at all, so no proxy is needed here.

type DeezerTrack = { id: number; title: string; preview: string; artist?: { name?: string } };
type DeezerAlbum = { id: number; artist?: { name?: string } };

function normalize(s: string): string {
  const stripped = s
    .split('')
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x0300 || code > 0x036f; // drop combining diacritics (café -> cafe)
    })
    .join('');
  return stripped.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Deezer's plain keyword search matches loosely against track titles — for
// an ALBUM title that isn't itself a track name (most albums), that can
// return something from a completely different artist. Scoring candidates
// by how closely their artist name matches the one we asked for catches
// that instead of blindly trusting the first hit.
function artistMatchScore(candidateArtist: string | undefined, wantedArtist: string): number {
  const a = normalize(candidateArtist || '');
  const w = normalize(wantedArtist);
  if (!a || !w) return 0;
  if (a === w) return 3;
  if (a.includes(w) || w.includes(a)) return 2;
  if (w.split(' ').some((word) => word.length > 2 && a.includes(word))) return 1;
  return 0;
}

async function searchDeezer<T>(path: string, q: string, limit: number): Promise<T[]> {
  const data = await deezerGet<{ data?: T[] }>(`${path}?q=${encodeURIComponent(q)}&limit=${limit}`);
  return data.data || [];
}

function bestByArtist<T extends { artist?: { name?: string } }>(items: T[], wantedArtist: string): { item: T; score: number } | null {
  let best: { item: T; score: number } | null = null;
  for (const item of items) {
    const score = artistMatchScore(item.artist?.name, wantedArtist);
    if (score > (best?.score ?? 0)) best = { item, score };
  }
  return best;
}

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const artist = params.get('artist') || '';
  const title = params.get('title') || '';
  if (!artist && !title) return NextResponse.json({ error: 'missing_query' }, { status: 400 });

  try {
    // Preview URLs are signed for 15 minutes, so a found preview is cached
    // for 10 and never served stale. The album search only runs when the
    // track search found nothing usable.
    const key = `dz-preview:v1:${artist.toLowerCase()}|${title.toLowerCase()}`;
    const result = await withSpotifyCache(key, 600, () => findPreview(artist, title), 0);
    if (!result) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    // Deliberately no Cache-Control: this route is keyed by artist/title
    // query params, and an edge cache that only looks at the path (not the
    // full query string) would serve one album's preview for every request.
    return NextResponse.json(result);
  } catch (err) {
    return upstreamErrorResponse(err, '/api/deezer/preview');
  }
}

async function findPreview(artist: string, title: string): Promise<{ title: string; preview: string } | null> {
  const tracks = await searchDeezer<DeezerTrack>('/search', `${artist} ${title}`, 5);
  const bestTrack = bestByArtist(tracks, artist);

  let result: { title: string; preview: string } | null = null;

  // `title` here is always a specific track title (every caller passes
  // one, not an album title) — a direct track match is the accurate one,
  // so it's tried first. Picking the album match whenever it scored at
  // least as well as the track match (as this used to) meant every track
  // in an album resolved to whatever track happened to come first in that
  // album's listing, regardless of which one was actually requested.
  if (bestTrack && bestTrack.score > 0 && bestTrack.item.preview) {
    result = { title: bestTrack.item.title, preview: bestTrack.item.preview };
  }

  // Fallback for a single that's missing from Deezer's track index but
  // whose parent album isn't: look for a track inside that album whose
  // title actually matches what was asked for, only falling back to
  // "whatever's first" if nothing in the album matches by title either.
  const bestAlbum = result ? null : bestByArtist(await searchDeezer<DeezerAlbum>('/search/album', `${artist} ${title}`, 3), artist);
  if (!result && bestAlbum && bestAlbum.score > 0) {
    const albumData = await deezerGet<{ tracks?: { data?: DeezerTrack[] } }>(`/album/${bestAlbum.item.id}`);
    const albumTracks = albumData.tracks?.data || [];
    const wanted = normalize(title);
    const titleMatch = albumTracks.find((t) => t.preview && normalize(t.title) === wanted)
      || albumTracks.find((t) => t.preview && wanted && (normalize(t.title).includes(wanted) || wanted.includes(normalize(t.title))));
    const fallback = titleMatch || albumTracks.find((t) => t.preview);
    if (fallback) result = { title: fallback.title, preview: fallback.preview };
  }

  return result;
}
