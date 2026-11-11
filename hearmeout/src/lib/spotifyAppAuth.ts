// Client-credentials ("app-only") token — no user login needed. Used for
// catalog browsing (search, single-item lookups). Spotify's Nov 2024 API
// changes gate a lot of the "curated" endpoints (new-releases, top-tracks,
// related-artists, batch album lookup, recommendations) behind Extended
// Quota Mode approval that a fresh dev-mode app doesn't have — confirmed by
// hand against this app's actual credentials. What DOES still work for a
// plain dev-mode app: /v1/search (all types), /v1/albums/{id} (singular),
// /v1/artists/{id}, /v1/artists/{id}/albums. Everything in lib/spotifyCatalog.ts
// is built only out of those.
let cachedToken: { value: string; expiresAt: number } | null = null;
let pendingToken: Promise<string> | null = null;

export async function getSpotifyAppToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30_000) {
    return cachedToken.value;
  }
  // A cold page can request several different albums/artists at once.
  // Share token renewal as well as the resulting token, including errors.
  pendingToken ??= requestSpotifyAppToken().finally(() => { pendingToken = null; });
  return pendingToken;
}

async function requestSpotifyAppToken(): Promise<string> {
  const raw = `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(raw).toString('base64'),
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });
  if (!res.ok) throw new Error(`Spotify app token request failed: ${res.status}`);
  const data = await res.json();
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}
