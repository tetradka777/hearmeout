import { prefetchAudio } from './webAudio';

// Deezer lookups go through our own server routes (see src/app/api/deezer/*)
// instead of a public CORS proxy — that proxy was flaky enough for real
// visitors (rate limits, outages) to leave the preview player stuck loading
// forever and artist photos permanently falling back to initials.
export async function fetchDeezerArtistPhoto(name: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/deezer/artist-photo?name=${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.photo ?? null;
  } catch {
    return null;
  }
}

// Found previews kept for 10 minutes (their links are signed for 15), so a
// track looked up ahead of time (prefetchTrackPreview) starts at once.
const PREVIEW_TTL_MS = 10 * 60 * 1000;
const previewCache = new Map<string, { at: number; promise: Promise<{ title: string; preview: string } | null> }>();

// albumSpotifyId lets the server pick the exact recording from that album.
export function fetchTrackPreview(artistName: string, trackTitle: string, albumSpotifyId?: string | null): Promise<{ title: string; preview: string } | null> {
  const key = `${artistName}|${trackTitle}|${albumSpotifyId ?? ''}`;
  const hit = previewCache.get(key);
  if (hit && Date.now() - hit.at < PREVIEW_TTL_MS) return hit.promise;
  const album = albumSpotifyId ? `&album=${encodeURIComponent(albumSpotifyId)}` : '';
  const promise = fetch(`/api/deezer/preview?artist=${encodeURIComponent(artistName)}&title=${encodeURIComponent(trackTitle)}${album}`)
    .then(async (res) => {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('request failed');
      return res.json() as Promise<{ title: string; preview: string }>;
    });
  previewCache.set(key, { at: Date.now(), promise });
  // A failure isn't kept: the next try asks again.
  promise.catch(() => previewCache.delete(key));
  return promise;
}

// Look a track's preview up now so pressing play doesn't wait for it, and
// fetch the audio file too (lib/webAudio plays it).
const warmedAudio = new Set<string>();
export function prefetchTrackPreview(artistName: string, trackTitle: string, albumSpotifyId?: string | null): void {
  fetchTrackPreview(artistName, trackTitle, albumSpotifyId)
    .then((tr) => {
      if (tr?.preview && typeof window !== 'undefined' && !warmedAudio.has(tr.preview)) {
        warmedAudio.add(tr.preview);
        prefetchAudio(tr.preview).catch(() => {});
      }
    })
    .catch(() => {});
}
