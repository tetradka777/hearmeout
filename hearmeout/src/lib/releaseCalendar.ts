import { supabaseAdmin } from './supabaseAdmin';
import { peekSpotifyCache, withSpotifyCache } from './spotifyCache';
import { deezerArtistIdForName, deezerReleasesById, type DeezerArtist } from './deezerServer';
import { fetchArtistAlbumsSplit, resolveSpotifyAlbumId } from './spotifyCatalog';
import { inBackground } from './spotifyPriority';
import { sendPush } from './push';
import { logServerError } from './errorLog';

// The fan clubs' release calendar: announced releases of the artists whose
// fan clubs you're in, and "remind me on release day" (migration 031).
// Spotify lists pre-announced albums with a future date (the artist's album
// list, already cached a day and shared with the artist page); Deezer adds
// any it knows. A release only Deezer knows gets id "dz:<id>" and is found
// on Spotify on the day it comes out.

export type UpcomingRelease = { albumId: string; artist: string; artistId: string; title: string; date: string; cover: string | null; reminded: boolean };

const ARTISTS = 40;

export async function upcomingForUser(userId: string): Promise<UpcomingRelease[]> {
  const admin = supabaseAdmin();
  const [{ data: follows }, { data: reminders }] = await Promise.all([
    admin.from('artist_follows').select('artist_id, artist_name').eq('user_id', userId).order('created_at', { ascending: false }).limit(ARTISTS),
    admin.from('release_reminders').select('album_id').eq('user_id', userId).is('sent_at', null),
  ]);
  if (!follows?.length) return [];
  const reminded = new Set((reminders || []).map((r) => r.album_id as string));
  // Keyed by the set of clubs (an hour): joining one shows its releases.
  const key = follows.map((f) => f.artist_id as string).sort().join(',');
  const list = await withSpotifyCache(`fc-upcoming:v1:${key}`, 3600, async () => {
    const today = new Date().toISOString().slice(0, 10);
    const out: Omit<UpcomingRelease, 'reminded'>[] = [];
    const seen = new Set<string>();
    // Artists whose album list isn't cached yet: the first few are asked
    // now, the rest in the background (they show within the hour) — so a
    // long list of clubs never holds the page up or bursts Spotify.
    let asked = 0;
    for (const f of follows) {
      const artist = f.artist_name as string;
      const artistId = f.artist_id as string;
      try {
        const albumsKey = `artistalbums:v1:${artistId}`;
        const fetchAlbums = () => withSpotifyCache(albumsKey, 86400, () => fetchArtistAlbumsSplit(artistId));
        let albums = await peekSpotifyCache<Awaited<ReturnType<typeof fetchArtistAlbumsSplit>>>(albumsKey);
        if (!albums && asked < 8) { asked++; albums = await fetchAlbums().catch(() => null); }
        else if (!albums) inBackground(fetchAlbums).catch(() => {});
        for (const a of albums?.upcoming ?? []) {
          if (!a.releaseDate || a.releaseDate <= today) continue;
          const k = `${artist.toLowerCase()}|${a.title.toLowerCase()}`;
          if (seen.has(k)) continue;
          seen.add(k);
          out.push({ albumId: a.id, artist, artistId, title: a.title, date: a.releaseDate, cover: a.cover });
        }
        const confirmed = await peekSpotifyCache<DeezerArtist | null>(`dz-artist-for:v1:${artistId}`);
        const dzId = confirmed?.id ?? await deezerArtistIdForName(artist);
        if (!dzId) continue;
        for (const r of await deezerReleasesById(dzId)) {
          if (r.date <= today) continue;
          const k = `${artist.toLowerCase()}|${r.title.toLowerCase()}`;
          if (seen.has(k)) continue;
          seen.add(k);
          out.push({ albumId: `dz:${r.id}`, artist, artistId, title: r.title, date: r.date, cover: r.cover });
        }
      } catch {
        // One artist failing shouldn't hide the rest.
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  });
  return list.map((r) => ({ ...r, reminded: reminded.has(r.albumId) }));
}

// Release day: a bell notification and a push for every reminder that's
// due, once. Run from the keep-alive ping, at most hourly.
let lastRun = 0;
let running = false;
export function maybeSendReleaseReminders(): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (running || Date.now() - lastRun < 3600000) return;
  lastRun = Date.now();
  running = true;
  (async () => {
    const admin = supabaseAdmin();
    const today = new Date().toISOString().slice(0, 10);
    const { data: due, error } = await admin.from('release_reminders').select('id, user_id, album_id, title, artist, cover_url, release_date').is('sent_at', null).lte('release_date', today).limit(200);
    if (error || !due?.length) return;
    for (const r of due) {
      let albumId = r.album_id as string;
      if (albumId.startsWith('dz:')) {
        const found = await inBackground(() => withSpotifyCache(`resolve-album:v2:${(r.title as string).toLowerCase()}:${(r.artist as string).toLowerCase()}`, 180 * 86400, () => resolveSpotifyAlbumId(r.title as string, r.artist as string))).catch(() => null);
        if (found) albumId = found;
      }
      const openable = !albumId.startsWith('dz:');
      await admin.from('notifications').insert({
        user_id: r.user_id, actor_id: null, kind: 'release',
        payload: { albumId: openable ? albumId : null, artist: r.artist, title: r.title, date: r.release_date, cover: r.cover_url, reminder: true },
      });
      await sendPush([r.user_id as string], {
        titleKey: 'push.newReleaseTitle',
        bodyKey: 'push.newReleaseBody',
        vars: { artist: r.artist as string, title: r.title as string },
        url: openable ? `/?screen=rate&id=${encodeURIComponent(albumId)}` : '/?screen=discover',
        tag: `release-${albumId}`,
      }).catch(() => 0);
      await admin.from('release_reminders').update({ sent_at: new Date().toISOString() }).eq('id', r.id);
    }
  })()
    .catch((err) => logServerError('release reminders', err))
    .finally(() => { running = false; });
}
