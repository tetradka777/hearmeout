import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { upcomingForUser } from '@/lib/releaseCalendar';

// Discover → "coming soon": announced releases of your fan clubs' artists,
// soonest first, each marked when you asked to be reminded.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  return NextResponse.json(await upcomingForUser(userId));
}
