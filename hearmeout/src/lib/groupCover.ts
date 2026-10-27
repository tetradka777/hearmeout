import type { supabaseAdmin } from './supabaseAdmin';

// A group's own cover (migration 034): an album cover from the music
// catalogues' image hosts, or a small picture made on the device. Never any
// other outside URL — its owner would see the IP of everyone in the group.
const COVER_HOSTS = /^https:\/\/(i\.scdn\.co|mosaic\.scdn\.co|[a-z0-9-]+\.mzstatic\.com|[a-z0-9-]+\.dzcdn\.net)\/[^\s'"()\\]+$/;
const MAX_DATA_KB = 300;

export function validGroupCover(v: unknown): string | null | undefined {
  if (v === null || v === '') return null;
  if (typeof v !== 'string') return undefined;
  if (v.length <= 600 && COVER_HOSTS.test(v)) return v;
  if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= MAX_DATA_KB * 1024) return v;
  return undefined;
}

// Covers by group id. Before migration 034 the column doesn't exist: no
// covers then, rather than a failed page.
export async function readGroupCovers(admin: ReturnType<typeof supabaseAdmin>, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const { data, error } = await admin.from('groups').select('id, cover').in('id', ids);
  if (error) return out;
  for (const g of data || []) if (g.cover) out.set(g.id as string, g.cover as string);
  return out;
}
