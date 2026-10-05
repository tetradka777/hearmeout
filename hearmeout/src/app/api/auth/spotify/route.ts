import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { spotifyAuthUrl } from '@/lib/spotify';
import { getCurrentUserId } from '@/lib/identity';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.redirect(`${origin}/`);

  const state = randomBytes(16).toString('hex');
  const cookieStore = await cookies();
  cookieStore.set('spotify_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return NextResponse.redirect(spotifyAuthUrl(state));
}

// Settings → Connections → Disconnect: drops this account's Spotify tokens
// (frees one of the limited beta spots). Play history already imported
// stays — it belongs to the user, not to the connection.
export async function DELETE() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const { error } = await supabaseAdmin().from('connections').delete().eq('user_id', userId).eq('provider', 'spotify');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
