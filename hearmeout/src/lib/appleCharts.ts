import { withSpotifyCache } from './spotifyCache';
import { isFunctionalAudio, resolveSpotifyAlbumId } from './spotifyCatalog';
import { RateLimitError } from './upstreamError';

// "Popular now": what people are actually playing this week — Apple Music's
// public most-played albums chart (updated daily, per country; no key).
// Spotify's own charts are closed to development-mode apps, and Deezer's
// chart depends on the server's country. Each album is matched to its
// Spotify album so it opens the usual album page. A country without an
// Apple chart (404) gets the US chart; a chart that's only temporarily
// unavailable isn't replaced by another country's.
export type ChartAlbum = { rank: number; spotifyId: string; title: string; artist: string; cover: string | null; genreBucket: string | null };

type AppleResult = { artistName: string; name: string; artworkUrl100?: string; genres?: { genreId?: string; name: string }[] };

const SIZE = 40;
// Apple's genre ids → the catalog's buckets (lib/genreBuckets).
const GENRE: Record<string, string> = {
  '18': 'Hip-Hop', '15': 'R&B', '7': 'Electronic', '17': 'Electronic', '21': 'Rock', '20': 'Rock', '1153': 'Rock',
  '14': 'Pop', '51': 'Pop', '12': 'Latin',
};
// Some countries' feeds only give the genre's name, in the local language.
const GENRE_NAMES: [RegExp, string][] = [
  [/латин|latin|latino/i, 'Latin'],
  [/хип-хоп|рэп|hip-hop|rap/i, 'Hip-Hop'],
  [/r&b|соул|soul/i, 'R&B'],
  [/электрон|танцев|electr|dance|tanz/i, 'Electronic'],
  [/рок|альтернатив|метал|панк|rock|alternati|metal|punk/i, 'Rock'],
  [/поп|pop/i, 'Pop'],
];
function bucketOf(genres: { genreId?: string; name: string }[]): string | null {
  for (const g of genres) if (g.genreId && GENRE[g.genreId]) return GENRE[g.genreId];
  for (const g of genres) for (const [re, b] of GENRE_NAMES) if (re.test(g.name)) return b;
  return null;
}

// Apple's feed server now and then hangs and answers 504 after 30 s: a
// 10-second limit and one more try.
async function appleChart(country: string): Promise<AppleResult[] | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`https://rss.applemarketingtools.com/api/v2/${country}/music/most-played/${SIZE}/albums.json`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (HearMeOut)' },
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);
    if (res?.status === 404) return null; // no chart for this country
    if (!res?.ok) continue;
    const data = await res.json().catch(() => null);
    const results = data?.feed?.results as AppleResult[] | undefined;
    return results?.length ? results : null;
  }
  throw new Error('Apple chart unavailable');
}

// Matching to Spotify runs four at a time; a Spotify rate limit stops it
// and the albums matched so far are used.
async function build(country: string): Promise<ChartAlbum[]> {
  // Children's albums and sleep/noise audio are left out: not what anyone
  // comes here to rate.
  const all = (await appleChart(country)) ?? (country !== 'us' ? await appleChart('us') : null) ?? [];
  const results = all.filter((r) => !(r.genres || []).some((g) => g.genreId === '4' || /дет|child|kinder|enfant|infantil/i.test(g.name)) && !isFunctionalAudio(r.name, r.artistName));
  const ids: (string | null)[] = new Array(results.length).fill(null);
  let next = 0;
  let limited = false;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (!limited && next < results.length) {
      const i = next++;
      const r = results[i];
      const artist = r.artistName.split(/ & |, /)[0];
      ids[i] = await withSpotifyCache(`albumid:v1:${r.name.toLowerCase()}|${artist.toLowerCase()}`, 30 * 86400, () => resolveSpotifyAlbumId(r.name, artist))
        .catch((err) => { if (err instanceof RateLimitError) limited = true; return null; });
    }
  }));
  const out: ChartAlbum[] = [];
  for (const [i, r] of results.entries()) {
    const spotifyId = ids[i];
    if (!spotifyId) continue;
    const bucket = bucketOf(r.genres || []);
    out.push({
      rank: all.indexOf(r) + 1,
      spotifyId,
      title: r.name,
      artist: r.artistName,
      cover: r.artworkUrl100 ? r.artworkUrl100.replace(/\/\d+x\d+bb\./, '/400x400bb.') : null,
      genreBucket: bucket,
    });
  }
  // Nothing usable isn't kept: the next request tries again.
  if (!out.length) throw new Error('Chart albums not matched');
  return out;
}

// Six hours per country; the matching to Spotify is cached for a month.
export function chartAlbums(region: string | null): Promise<ChartAlbum[]> {
  const country = region && /^[A-Za-z]{2}$/.test(region) ? region.toLowerCase() : 'us';
  return withSpotifyCache(`apple-chart:v4:${country}`, 6 * 3600, () => build(country));
}
