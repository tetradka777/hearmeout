export const SWAP_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SwapAlbum { albumId: string; title: string; artist: string; cover: string }
export interface SwapUser { id: string; name: string | null; handle: string | null; avatarUrl: string | null }
export interface SwapSide { user: SwapUser; album: SwapAlbum | null; note: string; score: number | null; reaction: string | null; finishedAt: string | null }
export interface SwapView { id: string; createdAt: string; completedAt: string | null; cancelledAt: string | null; canReveal: boolean; me: SwapSide; friend: SwapSide }
export interface SwapRow {
  id: string; user_a: string; user_b: string; album_a: SwapAlbum | null; album_b: SwapAlbum | null;
  note_a: string; note_b: string; score_a: number | null; score_b: number | null;
  reaction_a: string | null; reaction_b: string | null; finished_a: string | null; finished_b: string | null;
  created_at: string; completed_at: string | null; cancelled_at: string | null;
}
export interface SwapUserRow { id: string; name: string | null; handle: string | null; avatar_url: string | null }
export type SwapAction = 'pick' | 'finish' | 'cancel';
export type SwapMutation = { action: 'create'; friendId: string; albumId: string; note: string }
  | { action: 'pick'; id: string; albumId: string; note: string }
  | { action: 'finish'; id: string; score: number; reaction: string; expectedReceivedAlbumId: string }
  | { action: 'cancel'; id: string };

function text(value: unknown, max: number): string | null {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > max) return null;
  return value.trim();
}

export function parseSwapMutation(value: unknown, create = false): SwapMutation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (create || body.action === 'pick') {
    const note = text(body.note, 500);
    if (note === null || typeof body.albumId !== 'string' || !body.albumId.trim() || body.albumId.length > 160) return null;
    if (create) {
      if (typeof body.friendId !== 'string' || !SWAP_UUID.test(body.friendId)) return null;
      return { action: 'create', friendId: body.friendId, albumId: body.albumId.trim(), note };
    }
    if (typeof body.id !== 'string' || !SWAP_UUID.test(body.id)) return null;
    return { action: 'pick', id: body.id, albumId: body.albumId.trim(), note };
  }
  if (typeof body.id !== 'string' || !SWAP_UUID.test(body.id)) return null;
  if (body.action === 'cancel') return { action: 'cancel', id: body.id };
  if (body.action !== 'finish' || typeof body.score !== 'number' || !Number.isFinite(body.score)
    || body.score < 0.1 || body.score > 5 || Math.abs(body.score * 10 - Math.round(body.score * 10)) > 1e-9) return null;
  const reaction = text(body.reaction, 2000);
  const expectedReceivedAlbumId = body.expectedReceivedAlbumId;
  if (typeof expectedReceivedAlbumId !== 'string' || !expectedReceivedAlbumId.trim() || expectedReceivedAlbumId.length > 160
    || /[\u0000-\u001f\u007f]/.test(expectedReceivedAlbumId)) return null;
  return reaction === null ? null : { action: 'finish', id: body.id, score: body.score, reaction, expectedReceivedAlbumId: expectedReceivedAlbumId.trim() };
}

/** Mirrors the locked SQL transitions for UI-independent contract tests. SQL is authoritative. */
export function swapTransitionError(row: SwapRow, actor: string, action: SwapAction, expectedReceivedAlbumId?: string): string | null {
  if (actor !== row.user_a && actor !== row.user_b) return 'forbidden';
  if (row.completed_at || row.cancelled_at) return 'swap_closed';
  if (action === 'pick' && (row.finished_a || row.finished_b)) return 'swap_locked';
  if (action === 'finish') {
    if (!row.album_a || !row.album_b) return 'missing_album';
    if (actor === row.user_a ? row.finished_a : row.finished_b) return 'already_finished';
    if (!expectedReceivedAlbumId) return 'invalid_payload';
    const receivedAlbum = actor === row.user_a ? row.album_b : row.album_a;
    if (receivedAlbum.albumId !== expectedReceivedAlbumId) return 'album_changed';
  }
  return null;
}

/** The only response projection: never spread raw DB rows into a response. */
export function swapView(row: SwapRow, actor: string, users: SwapUserRow[]): SwapView | null {
  if (actor !== row.user_a && actor !== row.user_b) return null;
  const canReveal = Boolean(row.finished_a && row.finished_b && row.completed_at && !row.cancelled_at);
  const side = (key: 'a' | 'b'): SwapSide => {
    const id = key === 'a' ? row.user_a : row.user_b;
    const user = users.find((u) => u.id === id);
    const visible = id === actor || canReveal;
    return {
      user: { id, name: user?.name ?? null, handle: user?.handle ?? null, avatarUrl: user?.avatar_url ?? null },
      album: row[`album_${key}`], note: row[`note_${key}`],
      score: visible ? row[`score_${key}`] : null, reaction: visible ? row[`reaction_${key}`] : null,
      finishedAt: row[`finished_${key}`],
    };
  };
  return { id: row.id, createdAt: row.created_at, completedAt: row.completed_at, cancelledAt: row.cancelled_at,
    canReveal, me: side(actor === row.user_a ? 'a' : 'b'), friend: side(actor === row.user_a ? 'b' : 'a') };
}
