import { withSpotifyCache, peekSpotifyCacheMany } from './spotifyCache';
import { isFunctionalAudio } from './spotifyCatalog';
import { ALBUMS } from './data';

// "Popular now": what people are actually playing this week — Apple Music's
// public most-played albums chart (updated daily, per country; no key).
// Spotify's own charts are closed to development-mode apps, and Deezer's
// chart depends on the server's country. Unknown Spotify ids are resolved
// only when opening a card. A country without an
// Apple chart (404) gets the US chart; a chart that's only temporarily
// unavailable isn't replaced by another country's.
export type ChartAlbum = { rank: number; spotifyId?: string; title: string; artist: string; cover: string | null; genreBucket: string | null };

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

// Browsing never resolves albums through Spotify. Reuse known ids for scores.
export async function chartAlbums(region: string | null): Promise<ChartAlbum[]> {
 const country=region&&/^[A-Za-z]{2}$/.test(region)?region.toLowerCase():'us';
 const local=await chartPage(country);
 const raw=(local.length?local:country!=='us'?await chartPage('us'):[]).slice(0,SIZE);
 const keys=raw.map(a=>'resolve-album:v4:'+a.title.toLowerCase()+':'+a.artist.toLowerCase());
 const known=await peekSpotifyCacheMany([...keys,'apple-chart:v5:'+country]);
 const previous=known.get('apple-chart:v5:'+country)?.payload as ChartAlbum[]|undefined;
 return raw.map((album,i)=>{
  const exact=(a:{title:string;artist:string})=>a.title.toLowerCase()===album.title.toLowerCase()&&a.artist.toLowerCase()===album.artist.toLowerCase();
  const catalog=ALBUMS.find(exact)?.spotifyId;
  const resolved=known.get(keys[i])?.payload;
  const spotifyId=catalog||(typeof resolved==='string'?resolved:undefined)||previous?.find(exact)?.spotifyId;
  return {...album,...(spotifyId?{spotifyId}:{})};
 });
}

// For the endless "Popular now" shelf: one country's top 100 at a time,
// without matching to Spotify (a card is matched when it's opened, so a
// long scroll doesn't spend the Spotify quota). Your country first, then
// other big charts; the client drops albums it has already shown.
export type ChartAlbumLite = { rank: number; title: string; artist: string; cover: string | null; genreBucket: string | null; country: string };
const MORE_COUNTRIES = ['us', 'gb', 'de', 'fr', 'ca', 'au', 'br', 'mx', 'es', 'it', 'jp', 'kr', 'se', 'nl', 'pl', 'tr', 'in', 'ar', 'za', 'ie'];

export function moreChartCountries(region: string | null): string[] {
  const own = region && /^[A-Za-z]{2}$/.test(region) ? region.toLowerCase() : 'us';
  return [own, ...MORE_COUNTRIES.filter((c) => c !== own)];
}

export function chartPage(country: string): Promise<ChartAlbumLite[]> {
  return withSpotifyCache(`apple-raw:v1:${country}`, 6 * 3600, async () => {
    const res = await fetch(`https://rss.applemarketingtools.com/api/v2/${country}/music/most-played/100/albums.json`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (HearMeOut)' },
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);
    // Unsupported markets are empty, never another country's mislabeled chart.
    if (res?.status === 404) return [];
    // A transient failure throws, so it isn't cached as an empty chart.
    if (!res?.ok) throw new Error('Apple chart unavailable');
    const data = await res.json().catch(() => null);
    const all = (data?.feed?.results as AppleResult[] | undefined) ?? [];
    return all
      .filter((r) => !(r.genres || []).some((g) => g.genreId === '4' || /дет|child|kinder|enfant|infantil/i.test(g.name)) && !isFunctionalAudio(r.name, r.artistName))
      .map((r) => ({
        rank: all.indexOf(r) + 1,
        title: r.name,
        artist: r.artistName,
        cover: r.artworkUrl100 ? r.artworkUrl100.replace(/\/\d+x\d+bb\./, '/400x400bb.') : null,
        genreBucket: bucketOf(r.genres || []),
        country,
      }));
  });
}
