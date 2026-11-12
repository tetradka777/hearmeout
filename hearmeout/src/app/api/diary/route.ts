import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';
import { musicEntryAlbum } from '@/lib/musicEntryAlbum';
import {
  DIARY_COLUMNS, DIARY_PAGE_SIZE, DIARY_UUID, diaryInput, diaryEntry,
  diaryReadAccess, diaryEntriesQuery, diaryOwnedQuery,
} from '@/lib/musicDiary';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function GET(request: NextRequest) {
  const viewerId = await getCurrentUserId();
  if (!viewerId) return json({ error: 'not_registered' }, 401);
  const params = request.nextUrl.searchParams;
  const ownerId = params.get('userId') ?? viewerId;
  const rawFrom = params.get('from') ?? '0';
  const from = Number(rawFrom);
  if (!DIARY_UUID.test(ownerId) || !/^\d+$/.test(rawFrom) || !Number.isSafeInteger(from) || from > 2147483627) return json({ error: 'invalid_payload' }, 400);
  const summary = params.get('summary') === '1';
  const admin = supabaseAdmin();
  try {
    if (!await diaryReadAccess(admin, viewerId, ownerId)) return json({ error: 'forbidden' }, 403);
    const { data, error, count } = await diaryEntriesQuery(admin, ownerId, viewerId, summary)
      .range(summary ? 0 : from, summary ? 0 : from + DIARY_PAGE_SIZE - 1);
    if (error) return json({ error: 'diary_read_failed' }, 500);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    if (summary) return json({ total: count ?? 0, lastDate: rows[0]?.listened_on ?? null });
    const entries = rows.map(diaryEntry);
    const total = count ?? 0;
    return json({ entries, total, next: from + entries.length < total ? from + entries.length : null });
  } catch {
    return json({ error: 'diary_read_failed' }, 500);
  }
}

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return json({ error: 'not_registered' }, 401);
  const input = diaryInput(await request.json().catch(() => null));
  if (!input) return json({ error: 'invalid_payload' }, 400);
  try {
    const album = await musicEntryAlbum(input.albumId);
    if (!album) return json({ error: 'album_not_found' }, 400);
    const { data, error } = await supabaseAdmin().from('diary_entries').insert({
      user_id: userId, album_id: album.albumId, album_title: album.title, artist: album.artist, cover_url: album.cover,
      moment: input.moment, note: input.note, mood: input.mood, listened_on: input.listenedOn, visibility: input.visibility,
    }).select(DIARY_COLUMNS).single();
    if (error || !data) return json({ error: 'diary_write_failed' }, 500);
    return json({ entry: diaryEntry(data) }, 201);
  } catch {
    return json({ error: 'diary_write_failed' }, 500);
  }
}

export async function PATCH(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return json({ error: 'not_registered' }, 401);
  const body = await request.json().catch(() => null);
  const input = diaryInput(body);
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!input || !DIARY_UUID.test(id)) return json({ error: 'invalid_payload' }, 400);
  const admin = supabaseAdmin();
  try {
    const { data: existing, error: readError } = await admin.from('diary_entries').select('album_id').eq('id', id).eq('user_id', userId).maybeSingle();
    if (readError) return json({ error: 'diary_read_failed' }, 500);
    if (!existing) return json({ error: 'not_found' }, 404);
    const changes: Record<string, unknown> = {
      moment: input.moment, note: input.note, mood: input.mood, listened_on: input.listenedOn, visibility: input.visibility,
      updated_at: new Date().toISOString(),
    };
    if (existing.album_id !== input.albumId) {
      const album = await musicEntryAlbum(input.albumId);
      if (!album) return json({ error: 'album_not_found' }, 400);
      Object.assign(changes, { album_id: album.albumId, album_title: album.title, artist: album.artist, cover_url: album.cover });
    }
    const { data, error } = await diaryOwnedQuery(admin, 'update', userId, id, changes).select(DIARY_COLUMNS).maybeSingle();
    if (error) return json({ error: 'diary_write_failed' }, 500);
    if (!data) return json({ error: 'not_found' }, 404);
    return json({ entry: diaryEntry(data) });
  } catch {
    return json({ error: 'diary_write_failed' }, 500);
  }
}

export async function DELETE(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return json({ error: 'not_registered' }, 401);
  const id = request.nextUrl.searchParams.get('id') ?? '';
  if (!DIARY_UUID.test(id)) return json({ error: 'invalid_payload' }, 400);
  try {
    const { data, error } = await diaryOwnedQuery(supabaseAdmin(), 'delete', userId, id).select('id').maybeSingle();
    if (error) return json({ error: 'diary_write_failed' }, 500);
    if (!data) return json({ error: 'not_found' }, 404);
    return json({ ok: true });
  } catch {
    return json({ error: 'diary_write_failed' }, 500);
  }
}
