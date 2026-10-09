import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { maybeRunAutoSync } from '@/lib/autoSync';

// Keep-alive target (cron-job.org / UptimeRobot / the GitHub Actions ping):
// any incoming request keeps Render's free instance awake. Once an hour it
// also does one small database job, which keeps the Supabase free project
// from being paused after a week without activity: it deletes cache rows
// that expired more than three days ago (past the cache's stale window, so
// nothing reads them any more). It also starts the background Spotify
// sync (lib/autoSync). Neither is awaited for long, and a database problem
// never fails the ping.
export const dynamic = 'force-dynamic';

const EVERY_MS = 3600000;
let lastRun = 0;

export async function GET() {
  // Background Spotify sync rides on the same ping (lib/autoSync, at most
  // every 20 minutes, not awaited).
  maybeRunAutoSync();
  if (Date.now() - lastRun > EVERY_MS) {
    lastRun = Date.now();
    try {
      await supabaseAdmin().from('spotify_cache').delete().lt('expires_at', new Date(Date.now() - 3 * 86400000).toISOString());
    } catch {
      // The ping's job is keeping the server up; the cleanup can wait.
    }
  }
  return NextResponse.json({ ok: true, at: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
