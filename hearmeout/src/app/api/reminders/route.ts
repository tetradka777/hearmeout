import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// "Remind me on release day" (migration 031). POST adds a reminder for an
// announced album, DELETE ?albumId= removes it.
export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const b = await request.json().catch(() => null);
  const albumId = typeof b?.albumId === 'string' ? b.albumId.slice(0, 64) : '';
  const title = typeof b?.title === 'string' ? b.title.slice(0, 300) : '';
  const artist = typeof b?.artist === 'string' ? b.artist.slice(0, 200) : '';
  const date = typeof b?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : '';
  const cover = typeof b?.cover === 'string' && /^https:\/\//.test(b.cover) ? b.cover.slice(0, 500) : null;
  if (!albumId || !title || !artist || !date) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const { error } = await supabaseAdmin().from('release_reminders').upsert(
    { user_id: userId, album_id: albumId, title, artist, cover_url: cover, release_date: date, sent_at: null },
    { onConflict: 'user_id,album_id' },
  );
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const albumId = new URL(request.url).searchParams.get('albumId') || '';
  if (!albumId) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const { error } = await supabaseAdmin().from('release_reminders').delete().eq('user_id', userId).eq('album_id', albumId);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}
