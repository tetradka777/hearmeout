import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchAllRows } from '@/lib/supabasePaginate';

// Anonymous aggregates for the album page: every non-private score (for
// the distribution chart) and every non-private tag list (for the tags
// summary). Replaces direct browser reads of `ratings` — no user ids here.
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { rows: data, error } = await fetchAllRows((f, t) => supabaseAdmin().from('ratings').select('stars, tags, is_private').eq('album_id', id).order('id').range(f, t));
  if (error) return NextResponse.json({ error }, { status: 500 });
  const rows = (data || []).filter((r) => !r.is_private);
  return NextResponse.json({
    stars: rows.map((r) => Number(r.stars)),
    tags: rows.map((r) => (r.tags as string[] | null) || []),
  });
}
