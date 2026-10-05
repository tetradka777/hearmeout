import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';
import { fetchAllRows } from '@/lib/supabasePaginate';

type Row = { track_title: string | null; artist: string | null; cover_url: string | null; album_id: string | null; played_at: string };
export type OnThisDayGroup = { year: number; tracks: { title: string; artist: string; cover: string | null; albumId: string | null }[] };

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });

  const admin = supabaseAdmin();
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(now.getFullYear() - 1);

  const { rows, error } = await fetchAllRows<Row>((from, to) =>
    admin
      .from('listening_events')
      .select('track_title, artist, cover_url, album_id, played_at')
      .eq('user_id', userId)
      .lt('played_at', oneYearAgo.toISOString())
      .order('played_at', { ascending: false })
      .range(from, to)
  );
  if (error) return NextResponse.json({ error }, { status: 500 });

  const todayMonth = now.getMonth();
  const todayDate = now.getDate();
  const byYear = new Map<number, Map<string, { title: string; artist: string; cover: string | null; albumId: string | null }>>();

  for (const r of rows) {
    if (!r.track_title || !r.artist) continue;
    const d = new Date(r.played_at);
    if (d.getMonth() !== todayMonth || d.getDate() !== todayDate) continue;
    const year = d.getFullYear();
    const key = `${r.track_title}—${r.artist}`;
    if (!byYear.has(year)) byYear.set(year, new Map());
    byYear.get(year)!.set(key, { title: r.track_title, artist: r.artist, cover: r.cover_url, albumId: r.album_id });
  }

  const groups: OnThisDayGroup[] = [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, tracks]) => ({ year, tracks: [...tracks.values()].slice(0, 6) }));

  return NextResponse.json({ groups });
}
