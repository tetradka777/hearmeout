import { NextResponse } from 'next/server';

// Keep-alive target (cron-job.org / UptimeRobot / the GitHub Actions ping):
// any incoming request keeps Render's free instance awake, and this one
// touches neither the database nor Spotify, so pinging it often costs
// nothing.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ ok: true, at: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
