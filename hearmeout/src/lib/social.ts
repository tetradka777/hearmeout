import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_PRIVACY, fetchPrivacy } from './privacy';

// Comments and reactions (migration 029). A target names what they're on:
//   review:<userId>:<albumId>             a rating / review
//   play:<userId>:<albumId>:<yyyy-mm-dd>   a play in the feed
//   recap:<userId>:<period>:<yyyy-mm-dd>   a recap (its window's start)
//   award:<groupId>:<yyyy-mm>:<label>      a group award

export { REACTIONS, type ReactionKind } from './reactions';

export type SocialTarget =
  | { type: 'review'; ownerId: string; albumId: string }
  | { type: 'play'; ownerId: string; albumId: string; day: string }
  | { type: 'recap'; ownerId: string; period: string; start: string }
  | { type: 'award'; groupId: string; month: string; label: string };

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ALBUM = '[A-Za-z0-9_-]{1,80}';
const PATTERNS: [RegExp, (m: RegExpMatchArray) => SocialTarget][] = [
  [new RegExp(`^review:(${UUID}):(${ALBUM})$`), (m) => ({ type: 'review', ownerId: m[1], albumId: m[2] })],
  [new RegExp(`^play:(${UUID}):(${ALBUM}):(\\d{4}-\\d{2}-\\d{2})$`), (m) => ({ type: 'play', ownerId: m[1], albumId: m[2], day: m[3] })],
  [new RegExp(`^recap:(${UUID}):(day|week|month|season):(\\d{4}-\\d{2}-\\d{2})$`), (m) => ({ type: 'recap', ownerId: m[1], period: m[2], start: m[3] })],
  [new RegExp(`^award:(${UUID}):(\\d{4}-\\d{2}):([A-Za-z]{1,40})$`), (m) => ({ type: 'award', groupId: m[1], month: m[2], label: m[3] })],
];

export function parseTarget(key: string): SocialTarget | null {
  for (const [re, make] of PATTERNS) {
    const m = key.match(re);
    if (m) return make(m);
  }
  return null;
}

// Who is notified about comments and reactions on a target.
export function targetOwner(t: SocialTarget): string | null {
  return t.type === 'award' ? null : t.ownerId;
}

// Which of these targets the viewer may see and take part in: their own
// things and their friends'; anyone's review when its author keeps reviews
// public; a group award when they're in the group.
export async function allowedTargets(admin: SupabaseClient, viewerId: string, keys: string[]): Promise<Map<string, SocialTarget>> {
  const parsed = keys.map((k) => [k, parseTarget(k)] as const).filter((x): x is readonly [string, SocialTarget] => !!x[1]);
  const owners = [...new Set(parsed.flatMap(([, t]) => (t.type === 'award' ? [] : [t.ownerId])).filter((id) => id !== viewerId))];
  const groups = [...new Set(parsed.flatMap(([, t]) => (t.type === 'award' ? [t.groupId] : [])))];
  const [{ data: friendRows }, privacy, { data: memberRows }] = await Promise.all([
    owners.length ? admin.from('friendships').select('friend_id').eq('user_id', viewerId).in('friend_id', owners) : Promise.resolve({ data: [] as { friend_id: string }[] }),
    owners.length ? fetchPrivacy(admin, owners) : Promise.resolve(new Map()),
    groups.length ? admin.from('group_members').select('group_id').eq('user_id', viewerId).in('group_id', groups) : Promise.resolve({ data: [] as { group_id: string }[] }),
  ]);
  const friends = new Set((friendRows || []).map((r) => r.friend_id as string));
  const inGroups = new Set((memberRows || []).map((r) => r.group_id as string));
  const out = new Map<string, SocialTarget>();
  for (const [key, t] of parsed) {
    if (t.type === 'award') { if (inGroups.has(t.groupId)) out.set(key, t); continue; }
    if (t.ownerId === viewerId || friends.has(t.ownerId)) { out.set(key, t); continue; }
    if (t.type === 'review' && (privacy.get(t.ownerId) ?? DEFAULT_PRIVACY).publicReviews) out.set(key, t);
  }
  return out;
}

// The tables don't exist until migration 029 is applied.
export function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|Could not find the table/i.test(error.message || ''));
}
