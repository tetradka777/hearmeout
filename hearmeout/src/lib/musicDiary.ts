import type { SupabaseClient } from '@supabase/supabase-js';

export type DiaryMood = 'calm' | 'nostalgic' | 'energised';
export type DiaryVisibility = 'private' | 'friends';
export type DiaryEntry = {
  id: string;
  userId: string;
  albumId: string;
  albumTitle: string;
  artist: string;
  cover: string | null;
  moment: string;
  note: string;
  mood: DiaryMood | null;
  listenedOn: string;
  visibility: DiaryVisibility;
  createdAt: string;
  updatedAt: string;
};

export type DiaryInput = {
  albumId: string;
  moment: string;
  note: string;
  mood: DiaryMood | null;
  listenedOn: string;
  visibility: DiaryVisibility;
};

export const DIARY_PAGE_SIZE = 20;
export const DIARY_COLUMNS = 'id,user_id,album_id,album_title,artist,cover_url,moment,note,mood,listened_on,visibility,created_at,updated_at';
export const DIARY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isDiaryDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function diaryInput(value: unknown): DiaryInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.albumId !== 'string' || typeof body.moment !== 'string') return null;
  const albumId = body.albumId.trim();
  const moment = body.moment.trim();
  if (!albumId || albumId.length > 200 || /[\u0000-\u001f\u007f]/.test(albumId)) return null;
  if (!moment || moment.length > 120 || moment.includes('\u0000')) return null;
  const note = body.note === undefined ? '' : body.note;
  if (typeof note !== 'string' || note.length > 2000 || note.includes('\u0000')) return null;
  const mood = body.mood === undefined ? null : body.mood;
  if (mood !== null && mood !== 'calm' && mood !== 'nostalgic' && mood !== 'energised') return null;
  const visibility = body.visibility === undefined ? 'private' : body.visibility;
  if (visibility !== 'private' && visibility !== 'friends') return null;
  if (!isDiaryDate(body.listenedOn)) return null;
  return { albumId, moment, note, mood, listenedOn: body.listenedOn, visibility };
}

export function diaryEntry(row: Record<string, unknown>): DiaryEntry {
  return {
    id: row.id as string, userId: row.user_id as string, albumId: row.album_id as string,
    albumTitle: row.album_title as string, artist: row.artist as string, cover: (row.cover_url as string | null) ?? null,
    moment: row.moment as string, note: row.note as string, mood: row.mood as DiaryMood | null,
    listenedOn: row.listened_on as string, visibility: row.visibility as DiaryVisibility,
    createdAt: row.created_at as string, updatedAt: row.updated_at as string,
  };
}

// Both stored directions mean an accepted friendship. Never use the cached
// friendIdsOf helper here: unfriending must revoke sensitive diary access now.
export async function diaryReadAccess(admin: SupabaseClient, viewerId: string, ownerId: string): Promise<boolean> {
  if (viewerId === ownerId) return true;
  const [outward, inward] = await Promise.all([
    admin.from('friendships').select('user_id').eq('user_id', viewerId).eq('friend_id', ownerId),
    admin.from('friendships').select('user_id').eq('user_id', ownerId).eq('friend_id', viewerId),
  ]);
  if (outward.error || inward.error) throw new Error('friendship_read_failed');
  return Boolean(outward.data?.length && inward.data?.length);
}

// Visibility is part of the database predicate, so total/lastDate never count
// private rows for a friend, including when there are no shared entries.
export function diaryEntriesQuery(admin: SupabaseClient, ownerId: string, viewerId: string, summary = false) {
  let query = admin.from('diary_entries').select(summary ? 'listened_on' : DIARY_COLUMNS, { count: 'exact' }).eq('user_id', ownerId);
  if (ownerId !== viewerId) query = query.eq('visibility', 'friends');
  return query.order('listened_on', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false });
}

export function diaryOwnedQuery(admin: SupabaseClient, action: 'update' | 'delete', ownerId: string, id: string, changes?: Record<string, unknown>) {
  const table = admin.from('diary_entries');
  return (action === 'update' ? table.update(changes ?? {}) : table.delete()).eq('id', id).eq('user_id', ownerId);
}
