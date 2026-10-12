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

// albumSpotifyId lets the server pick the exact recording from that album.
export async function fetchTrackPreview(artistName: string, trackTitle: string, albumSpotifyId?: string | null): Promise<{ title: string; preview: string } | null> {
  const album = albumSpotifyId ? `&album=${encodeURIComponent(albumSpotifyId)}` : '';
  const res = await fetch(`/api/deezer/preview?artist=${encodeURIComponent(artistName)}&title=${encodeURIComponent(trackTitle)}${album}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('request failed');
  return res.json();
}
