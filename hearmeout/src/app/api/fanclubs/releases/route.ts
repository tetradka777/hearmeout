import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { peekSpotifyCache, withSpotifyCache } from '@/lib/spotifyCache';
import { releaseNameKey } from '@/lib/format';
import { deezerArtistIdForName, deezerReleasesById, type DeezerArtist } from '@/lib/deezerServer';

export type FanClubRelease = { artist: string; artistId: string; title: string; date: string; cover: string | null };

const ARTISTS = 40;   // fan clubs looked at (newest first)
const PER_ARTIST = 2; // latest releases each

// Discover → "fan club releases": the latest one or two releases of every
// artist whose fan club you're in, newest first. From Deezer (no Spotify
// requests); the Deezer artist is the one already confirmed for the
// Spotify id, else a name nobody else on Deezer has. An hour per set of clubs.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });
  const { data: follows } = await supabaseAdmin().from('artist_follows').select('artist_id, artist_name').eq('user_id', userId).order('created_at', { ascending: false }).limit(ARTISTS);
  if (!follows?.length) return NextResponse.json([]);
  // Keyed by the set of clubs: joining one shows its releases at once, and
  // people in the same clubs share the answer.
  const key = follows.map((f) => f.artist_id as string).sort().join(',');
  const items = await withSpotifyCache(`fc-releases:v3:${key}`, 3600, async () => {
    const today = new Date().toISOString().slice(0, 10);
    const out: FanClubRelease[] = [];
    const seen = new Set<string>();
    for (const f of follows || []) {
      const name = f.artist_name as string;
      const spotifyId = f.artist_id as string;
      try {
        const confirmed = await peekSpotifyCache<DeezerArtist | null>(`dz-artist-for:v1:${spotifyId}`);
        const dzId = confirmed?.id ?? await deezerArtistIdForName(name);
        if (!dzId) continue;
        let n = 0;
        for (const r of await deezerReleasesById(dzId)) {
          if (n >= PER_ARTIST) break;
          const k = `${name.toLowerCase()}|${releaseNameKey(r.title)}`;
          if (r.date > today || seen.has(k)) continue;
          seen.add(k);
          n++;
          out.push({ artist: name, artistId: spotifyId, title: r.title, date: r.date, cover: r.cover });
        }
      } catch {
        // One artist failing shouldn't hide the rest.
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  });
  return NextResponse.json(items);
}
