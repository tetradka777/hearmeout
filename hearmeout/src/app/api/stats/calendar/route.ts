import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';
import { fetchAllRows } from '@/lib/supabasePaginate';

type Row = { played_at: string; duration_ms: number | null };

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });

  const admin = supabaseAdmin();
  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);

  const { rows, error } = await fetchAllRows<Row>((from, to) =>
    admin
      .from('listening_events')
      .select('played_at, duration_ms')
      .eq('user_id', userId)
      .gte('played_at', since.toISOString())
      .order('played_at', { ascending: true })
      .range(from, to)
  );
  if (error) return NextResponse.json({ error }, { status: 500 });

  const byDay = new Map<string, number>();
  for (const r of rows) {
    const day = r.played_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) || 0) + (r.duration_ms || 0));
  }
  const days = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, ms]) => ({ day, minutes: Math.round(ms / 60000) }));

  return NextResponse.json({ days });
}
