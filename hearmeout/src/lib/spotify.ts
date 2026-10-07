// user-read-private: the account country for region detection (migration 023).
const SPOTIFY_SCOPES = ['user-read-recently-played', 'user-top-read', 'user-read-private'].join(' ');

function basicAuthHeader() {
  const raw = `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`;
  return 'Basic ' + Buffer.from(raw).toString('base64');
}

export function spotifyAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    scope: SPOTIFY_SCOPES,
    state,
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export type SpotifyTokens = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
};

export async function exchangeCodeForTokens(code: string): Promise<SpotifyTokens> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    }),
  });
  if (!res.ok) throw new Error(`Spotify token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<Omit<SpotifyTokens, 'refresh_token'> & { refresh_token?: string }> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Spotify token refresh failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export type SpotifyProfile = { id: string; display_name: string | null; images: { url: string }[]; country?: string };

export async function fetchSpotifyProfile(accessToken: string): Promise<SpotifyProfile> {
  const res = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Spotify profile request failed: ${res.status}`);
  return res.json();
}

export type SpotifyRecentlyPlayedItem = {
  played_at: string;
  track: {
    id: string;
    name: string;
    duration_ms: number;
    album: { id: string; name: string; release_date?: string; images: { url: string }[] };
    artists: { id: string; name: string }[];
  };
};

export async function fetchRecentlyPlayed(accessToken: string, afterMs?: number): Promise<SpotifyRecentlyPlayedItem[]> {
  const params = new URLSearchParams({ limit: '50' });
  if (afterMs) params.set('after', String(afterMs));
  const res = await fetch(`https://api.spotify.com/v1/me/player/recently-played?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Spotify recently-played request failed: ${res.status}`);
  const data = await res.json();
  return data.items || [];
}
