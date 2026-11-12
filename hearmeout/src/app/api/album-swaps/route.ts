import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { musicEntryAlbum } from '@/lib/musicEntryAlbum';
import { parseSwapMutation, swapView, SWAP_UUID, type SwapRow, type SwapUserRow, type SwapMutation } from '@/lib/albumSwaps';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: PRIVATE_HEADERS });
}
function failure(error: string, status: number) { return json({ error }, status); }

async function project(rows: SwapRow[], actor: string, admin: ReturnType<typeof supabaseAdmin>) {
  if (!rows.length) return [];
  const ids = [...new Set(rows.flatMap((row) => [row.user_a, row.user_b]))];
  const { data, error } = await admin.from('users').select('id,name,handle,avatar_url').in('id', ids);
  if (error) throw new Error('profile_lookup_failed');
  return rows.flatMap((row) => {
    const view = swapView(row, actor, (data ?? []) as SwapUserRow[]);
    return view ? [view] : [];
  });
}

export async function GET(request: NextRequest) {
  try {
    const actor = await getCurrentUserId();
    if (!actor || !SWAP_UUID.test(actor)) return failure('not_registered', 401);
    const admin = supabaseAdmin();
    const id = request.nextUrl.searchParams.get('id');
    if (id !== null) {
      if (!SWAP_UUID.test(id)) return failure('invalid_payload', 400);
      const { data, error } = await admin.from('album_swaps').select('*').eq('id', id).maybeSingle();
      if (error) return failure('request_failed', 500);
      const row = data as SwapRow | null;
      if (!row || (row.user_a !== actor && row.user_b !== actor)) return failure('forbidden', 403);
      const [swap] = await project([row], actor, admin);
      return json({ swap });
    }
    // Keep bounded history from pushing active exchanges out of the shared list.
    // The only interpolated value is a validated signed-session UUID.
    const own = `user_a.eq.${actor},user_b.eq.${actor}`;
    const [active, completed, cancelled] = await Promise.all([
      admin.from('album_swaps').select('*').or(own).is('completed_at', null).is('cancelled_at', null)
        .order('created_at', { ascending: false }).limit(100),
      admin.from('album_swaps').select('*').or(own).not('completed_at', 'is', null)
        .order('created_at', { ascending: false }).limit(50),
      admin.from('album_swaps').select('*').or(own).not('cancelled_at', 'is', null)
        .order('created_at', { ascending: false }).limit(50),
    ]);
    if (active.error || completed.error || cancelled.error) return failure('request_failed', 500);
    const history = [...(completed.data ?? []), ...(cancelled.data ?? [])]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 50);
    const rows = [...(active.data ?? []), ...history] as SwapRow[];
    return json({ swaps: await project(rows, actor, admin) });
  } catch {
    return failure('request_failed', 500);
  }
}

async function mutate(request: NextRequest, create: boolean) {
  try {
    const actor = await getCurrentUserId();
    if (!actor || !SWAP_UUID.test(actor)) return failure('not_registered', 401);
    const input: SwapMutation | null = parseSwapMutation(await request.json().catch(() => null), create);
    if (!input) return failure('invalid_payload', 400);
    if (input.action === 'create' && input.friendId === actor) return failure('invalid_payload', 400);
    const admin = supabaseAdmin();
    // Reject unrelated callers before resolving an album (which can use an upstream API).
    if (input.action === 'create') {
      const [outward, inward] = await Promise.all([
        admin.from('friendships').select('user_id').eq('user_id', actor).eq('friend_id', input.friendId).maybeSingle(),
        admin.from('friendships').select('user_id').eq('user_id', input.friendId).eq('friend_id', actor).maybeSingle(),
      ]);
      if (outward.error || inward.error) return failure('request_failed', 500);
      if (!outward.data || !inward.data) return failure('friends_required', 403);
    } else if (input.action === 'pick') {
      const { data, error } = await admin.from('album_swaps').select('user_a,user_b,finished_a,finished_b,completed_at,cancelled_at').eq('id', input.id).maybeSingle();
      if (error) return failure('request_failed', 500);
      if (!data || (data.user_a !== actor && data.user_b !== actor)) return failure('forbidden', 403);
      if (data.completed_at || data.cancelled_at) return failure('swap_closed', 409);
      if (data.finished_a || data.finished_b) return failure('swap_locked', 409);
    }
    const album = input.action === 'create' || input.action === 'pick' ? await musicEntryAlbum(input.albumId) : null;
    if ((input.action === 'create' || input.action === 'pick') && !album) return failure('album_not_found', 400);
    const { data, error } = await admin.rpc('mutate_album_swap', {
      p_actor: actor,
      p_action: input.action,
      p_swap_id: 'id' in input ? input.id : null,
      p_friend: input.action === 'create' ? input.friendId : null,
      p_album: input.action === 'finish' ? { albumId: input.expectedReceivedAlbumId } : album,
      p_note: 'note' in input ? input.note : '',
      p_score: input.action === 'finish' ? input.score : null,
      p_reaction: input.action === 'finish' ? input.reaction : '',
    });
    if (error) {
      if (error.code === '23505') return failure('active_swap_exists', 409);
      const message = error.message;
      if (error.code === 'P0001') {
        if (message === 'forbidden' || message === 'friends_required') return failure(message, 403);
        if (message === 'invalid_payload') return failure(message, 400);
        if (['swap_closed', 'swap_locked', 'missing_album', 'already_finished', 'album_changed'].includes(message)) return failure(message, 409);
      }
      return failure('request_failed', 500);
    }
    const row = (Array.isArray(data) ? data[0] : data) as SwapRow | null;
    if (!row || (row.user_a !== actor && row.user_b !== actor)) return failure('request_failed', 500);
    const [swap] = await project([row], actor, admin);
    return json({ swap }, create ? 201 : 200);
  } catch {
    return failure('request_failed', 500);
  }
}

export async function POST(request: NextRequest) { return mutate(request, true); }
export async function PATCH(request: NextRequest) { return mutate(request, false); }
