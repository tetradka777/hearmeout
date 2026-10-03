import { cache } from 'react';
import { supabaseAdmin } from './supabaseAdmin';
import { getUserProfile } from './userProfile';
import { ALBUMS } from './data';
import type { PublicProfile } from './types';

export type FingerprintEntry = { genre: string; avg: number; count: number };

export type PublicProfileData = {
  profile: PublicProfile;
  // Empty for a locked (private) profile.
  fingerprint: FingerprintEntry[];
  topGenre: string | null;
  top4: { id: string; title: string; cover: string | null }[];
};

// Everything /u/[handle] shows, shared by the page, its metadata and its
// Open Graph image. Always the anonymous view (viewerId null), so the page
// and the link preview respect the owner's privacy switch the same way for
// everyone. cache() dedupes the page + generateMetadata calls per request.
export const loadPublicProfile = cache(async (handle: string): Promise<PublicProfileData | null> => {
  const raw = decodeURIComponent(handle);
  const normalized = raw.startsWith('@') ? raw : `@${raw}`;
  const admin = supabaseAdmin();
  const { data: user } = await admin.from('users').select('id').eq('handle', normalized).maybeSingle();
  if (!user) return null;
  const profile = await getUserProfile(admin, user.id, null);
  if (!profile) return null;
  if (profile.locked) return { profile, fingerprint: [], topGenre: null, top4: [] };

  // Taste fingerprint (prototype fingerprint()): average score per genre
  // over the person's public ratings, highest average first. Genre comes
  // from the static catalog, same as the in-app Profile → taste tab.
  const { data: ratings } = await admin.from('ratings').select('album_id, stars, is_private').eq('user_id', user.id);
  const byGenre = new Map<string, { sum: number; count: number }>();
  for (const r of ratings || []) {
    if (r.is_private) continue;
    const genre = ALBUMS.find((a) => a.id === r.album_id)?.genreBucket;
    if (!genre) continue;
    const cur = byGenre.get(genre) || { sum: 0, count: 0 };
    cur.sum += Number(r.stars);
    cur.count += 1;
    byGenre.set(genre, cur);
  }
  const fingerprint = [...byGenre.entries()]
    .map(([genre, { sum, count }]) => ({ genre, avg: sum / count, count }))
    .sort((a, b) => b.avg - a.avg);

  return { profile, fingerprint, topGenre: fingerprint[0]?.genre ?? profile.genres[0]?.g ?? null, top4: await resolveTop4(profile.top4Albums) };
});

// Title/cover for the top-4 tiles: the static catalog first, then whatever
// the shared Spotify cache already holds for a live album (key
// "album:{spotifyId}", stale entries are fine) — never a fresh Spotify call
// from a public page render.
async function resolveTop4(ids: string[]): Promise<{ id: string; title: string; cover: string | null }[]> {
  const missing = ids.filter((id) => !ALBUMS.some((a) => a.id === id));
  const cached = new Map<string, { title: string; cover: string | null }>();
  if (missing.length) {
    const { data } = await supabaseAdmin().from('spotify_cache').select('key, payload').in('key', missing.map((id) => `album:${id}`));
    for (const row of data || []) {
      const p = row.payload as { title?: string; cover?: string | null } | null;
      if (p?.title) cached.set(String(row.key).slice('album:'.length), { title: p.title, cover: p.cover ?? null });
    }
  }
  return ids.flatMap((id) => {
    const a = ALBUMS.find((x) => x.id === id);
    if (a) return [{ id, title: a.title, cover: a.cover || null }];
    const c = cached.get(id);
    return c ? [{ id, ...c }] : [];
  });
}
