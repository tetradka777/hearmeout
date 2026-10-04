import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';
import { isDemoAccountId } from '@/lib/demoAccounts';

export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });

  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json([]);

  // Two plain .ilike() queries (name, handle) with LIKE wildcards in the
  // query escaped, merged by id — instead of interpolating q into an .or()
  // filter string, where "," "(" ")" could rewrite the filter. People who
  // turned off "Appear in Discover" (Settings → Privacy) aren't returned.
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const admin = supabaseAdmin();
  const query = (column: 'name' | 'handle') => admin
    .from('users')
    .select('id, name, handle, avatar_url')
    .ilike(column, pattern)
    .neq('id', userId)
    .not('discoverable', 'is', false)
    .limit(10);
  const [byName, byHandle] = await Promise.all([query('name'), query('handle')]);
  const error = byName.error || byHandle.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const data = [...new Map([...(byName.data || []), ...(byHandle.data || [])].map((u) => [u.id as string, u])).values()].slice(0, 10);

  return NextResponse.json(
    data
      .filter((u) => !isDemoAccountId(u.id))
      .map((u) => ({ id: u.id, name: u.name, handle: u.handle, avatarUrl: u.avatar_url }))
  );
}
