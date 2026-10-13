import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from './supabaseAdmin';
import { fetchAllRows } from './supabasePaginate';
import { withSpotifyCache } from './spotifyCache';
import { fetchArtistAlbumsSplit, resolveSpotifyArtistId } from './spotifyCatalog';
import { RateLimitError } from './upstreamError';
import { popularArtists, topArtistsOf } from './tickerNews';
import { sendPush } from './push';
import { logServerError } from './errorLog';

// "New release" notifications (migration 028). Spotify has no "new album"
// event, so every few hours the keep-alive ping checks the artists people
// care about: each person's most played artists (90 days) and the ones they
// follow, plus the most popular catalog artists for those who turned that
// on. A release out within the last couple of days becomes one in-app
// notification and a push, once per release per person, at most a couple a
// day. Artist lookups share the Spotify cache with the news strip, and each
// artist is looked up once per run however many people listen to them.
const CHECK_EVERY_MS = 3 * 60 * 60 * 1000;
const FRESH_DAYS = 2;
const MINE_ARTISTS = 10;
const POPULAR_ARTISTS = 30;
const PER_DAY = 2;
const MAX_LOOKUPS = 300;
const dayMs = 86400000;

type Release = { albumId: string; artist: string; title: string; date: string; cover: string | null };
type Candidate = Release & { popular: boolean };

let lastCheck = 0;
let running = false;

export function maybeNotifyReleases(): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (running || Date.now() - lastCheck < CHECK_EVERY_MS) return;
  lastCheck = Date.now();
  running = true;
  runReleaseNotifications()
    .catch((err) => logServerError('release notifications', err))
    .finally(() => { running = false; });
}

class OutOfBudget extends Error {}

// The newest release of each artist out within FRESH_DAYS, memoized per run.
function releaseLookup() {
  const memo = new Map<string, Promise<Release | null>>();
  let lookups = 0;
  const fromDay = new Date(Date.now() - FRESH_DAYS * dayMs).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return (artist: string, knownId?: string): Promise<Release | null> => {
    const key = knownId || artist.toLowerCase();
    const hit = memo.get(key);
    if (hit) return hit;
    if (++lookups > MAX_LOOKUPS) throw new OutOfBudget();
    const p = (async () => {
      const id = knownId || await withSpotifyCache(`artistid:v2:${artist.toLowerCase()}`, 30 * 86400, () => resolveSpotifyArtistId(artist));
      if (!id) return null;
      const { released } = await withSpotifyCache(`artistalbums:v1:${id}`, 12 * 3600, () => fetchArtistAlbumsSplit(id));
      const fresh = released.find((a) => a.releaseDate && a.releaseDate.length === 10 && a.releaseDate >= fromDay && a.releaseDate <= today);
      return fresh ? { albumId: fresh.id, artist, title: fresh.title, date: fresh.releaseDate!, cover: fresh.cover } : null;
    })().catch((err) => {
      // A rate limit ends the run; any other failure only skips this artist.
      if (err instanceof RateLimitError) throw err;
      return null;
    });
    memo.set(key, p);
    return p;
  };
}

async function followsOf(admin: SupabaseClient, userId: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await admin.from('artist_follows').select('artist_id, artist_name').eq('user_id', userId);
  if (error) return [];
  return (data || []).map((r) => ({ id: r.artist_id as string, name: r.artist_name as string }));
}

// One pass over everyone (or the given people). Returns how many
// notifications were created.
export async function runReleaseNotifications(opts: { userIds?: string[] } = {}): Promise<number> {
  const admin = supabaseAdmin();
  const { rows: users, error } = await fetchAllRows((f, t) => {
    const q = admin.from('users').select('id, notify_releases_mine, notify_releases_popular');
    return (opts.userIds ? q.in('id', opts.userIds) : q).order('id').range(f, t);
  });
  // No columns yet: migration 028 isn't applied, nothing to do.
  if (error) return 0;

  const lookup = releaseLookup();
  let popular: Candidate[] | null = null;
  const popularReleases = async (): Promise<Candidate[]> => {
    if (popular) return popular;
    const out: Candidate[] = [];
    for (const artist of popularArtists(POPULAR_ARTISTS)) {
      const r = await lookup(artist);
      if (r) out.push({ ...r, popular: true });
    }
    popular = out;
    return out;
  };

  let created = 0;
  try {
    for (const u of users || []) {
      const userId = u.id as string;
      const wantMine = u.notify_releases_mine !== false;
      const wantPopular = u.notify_releases_popular === true;
      if (!wantMine && !wantPopular) continue;

      const candidates: Candidate[] = [];
      if (wantMine) {
        const follows = await followsOf(admin, userId);
        const followed = new Set(follows.map((f) => f.name.toLowerCase()));
        const top = (await topArtistsOf(admin, userId, MINE_ARTISTS)).filter((a) => !followed.has(a.toLowerCase()));
        for (const f of follows) { const r = await lookup(f.name, f.id); if (r) candidates.push({ ...r, popular: false }); }
        for (const a of top) { const r = await lookup(a); if (r) candidates.push({ ...r, popular: false }); }
      }
      if (wantPopular) candidates.push(...await popularReleases());
      if (!candidates.length) continue;

      const { data: past } = await admin.from('notifications').select('payload, created_at')
        .eq('user_id', userId).eq('kind', 'release').gte('created_at', new Date(Date.now() - 30 * dayMs).toISOString());
      const seen = new Set((past || []).map((n) => (n.payload as { albumId?: string } | null)?.albumId));
      let left = PER_DAY - (past || []).filter((n) => Date.now() - new Date(n.created_at as string).getTime() < dayMs).length;

      for (const c of candidates) {
        if (left <= 0) break;
        if (seen.has(c.albumId)) continue;
        seen.add(c.albumId);
        const { error: insErr } = await admin.from('notifications').insert({
          user_id: userId, actor_id: null, kind: 'release',
          payload: { albumId: c.albumId, artist: c.artist, title: c.title, date: c.date, cover: c.cover, popular: c.popular },
        });
        if (insErr) continue; // already notified (unique index) or migration missing
        left--;
        created++;
        await sendPush([userId], {
          titleKey: 'push.newReleaseTitle',
          bodyKey: 'push.newReleaseBody',
          vars: { artist: c.artist, title: c.title },
          url: `/?screen=rate&id=${encodeURIComponent(c.albumId)}`,
          tag: `release-${c.albumId}`,
        });
      }
    }
  } catch (err) {
    // Out of lookups or rate-limited: the rest waits for the next run.
    if (!(err instanceof OutOfBudget) && !(err instanceof RateLimitError)) throw err;
  }
  return created;
}
