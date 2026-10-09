import { supabaseAdmin } from './supabaseAdmin';
import { syncSpotifyForUser } from './spotifySync';
import { enrichListeningHistoryCovers } from './enrichListeningHistory';

// Background Spotify sync for everyone who connected it. Spotify's
// recently-played list only holds the last 50 tracks, so without this the
// plays between two "Sync now" presses beyond those 50 were lost, though
// Settings promises "we sync automatically". The server is a long-lived
// Node process on Render that the keep-alive ping hits every 5 minutes;
// that ping calls this, and it runs at most every INTERVAL_MS, one user at
// a time, then fills in covers/genres for that user's history.
const INTERVAL_MS = 20 * 60 * 1000;
let lastStart = 0;
let running = false;

export function maybeRunAutoSync(): void {
  // Production only: a local dev server shares the same database and would
  // otherwise sync real users' Spotify accounts from a laptop.
  if (process.env.NODE_ENV !== 'production') return;
  if (running || Date.now() - lastStart < INTERVAL_MS) return;
  running = true;
  lastStart = Date.now();
  runAutoSync().catch((err) => console.error('auto sync:', err)).finally(() => { running = false; });
}

async function runAutoSync(): Promise<void> {
  const admin = supabaseAdmin();
  const { data } = await admin.from('connections').select('user_id').eq('provider', 'spotify');
  for (const row of data || []) {
    const userId = row.user_id as string;
    try {
      await syncSpotifyForUser(admin, userId);
    } catch (err) {
      // A revoked token or a rate limit for one user shouldn't stop the rest.
      console.error('auto sync user failed:', err instanceof Error ? err.message : err);
    }
    await enrichListeningHistoryCovers(admin, userId).catch(() => {});
  }
}
