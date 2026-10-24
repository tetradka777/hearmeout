import { peekSpotifyCache, storeSpotifyCache } from './spotifyCache';
import { deezerArtistByName, deezerArtistIdForName, deezerGet } from './deezerServer';
import { inBackground } from './spotifyPriority';
import { logServerError } from './errorLog';

// Discover → "lesser-known artists": our picks first, always, then artists
// whose audience keeps growing. Spotify's development mode gives no
// listener or follower numbers, so growth is read from Deezer fan counts:
// once a day the fans of every candidate are written down (Deezer only, no
// Spotify requests), and every two weeks the list is rebuilt from that
// history — the artists that grew the most, steadily, over the last weeks.
// Candidates: artists Deezer lists as related to our picks, with a small
// audience (MIN_FANS–MAX_FANS fans).

// With their Spotify ids: names alone have namesakes ("Miley", "ear").
export const PINNED: { name: string; id: string }[] = [
  { name: 'Miley', id: '2HyX28Qfseedl5InpM6g63' },
  { name: 'waterproof goldstar', id: '0XJvFR4C2esBAZYIWt8oAQ' },
  { name: 'earfzilla', id: '65SDZetBIC5qK27DoJUx0f' },
  { name: 'Tiffany Day', id: '5D5Qbe1lf3aMnLsPSzXItu' },
  { name: 'Pittkiid', id: '3We5jBxbarjQ4vEACWXFQO' },
  { name: 'ONDA ANDAR', id: '2gGvBjb55mnnbQO2gNQSLo' },
  { name: 'campthehills', id: '01Xh6d2xRTGEpxZw0Khyrs' },
  { name: 'the sound chalk makes', id: '4uiFRdH1ESOicHwBuTbsY5' },
  { name: 'ear', id: '3bABCGLkFvjnNIKHvPVHDG' },
  { name: 'Feng', id: '278vNvolx8H3sQJ2hgOMnh' },
  { name: 'Аудиовирусы', id: '56t5rHCYsl5CnurNcLNySY' },
  { name: 'Veronica Everheart', id: '0NSLJ2nRp4Nk4G0wCz6XYL' },
  { name: 'Платина', id: '4TzGOY9RpErzedN02w8Boh' },
  { name: 'Jim Legxacy', id: '7IrBqZo6diq3hV3GpUhrs2' },
];

const MIN_FANS = 300;
const MAX_FANS = 250_000;
const MAX_TRACKED = 500;
const KEEP_DAYS = 90;
const SNAPSHOT_EVERY_MS = 20 * 3600 * 1000;
const LIST_EVERY_MS = 14 * 86400 * 1000;
const HIST_KEY = 'rising:hist:v1';
const LIST_KEY = 'rising:list:v1';
const YEAR = 365 * 86400;

type Tracked = { name: string; photo: string | null; points: [day: string, fans: number][] };
type History = { at: number; artists: Record<string, Tracked> };
export type RisingArtist = { name: string; photo: string | null; fans: number; growth: number };
type RisingList = { at: number; artists: RisingArtist[] };

const pinnedSet = new Set(PINNED.map((a) => a.name.toLowerCase()));
type DzArtist = { id: number; name: string; nb_fan?: number; picture_medium?: string };

// Today's fans for the candidates, added to the history.
async function snapshot(): Promise<History> {
  const hist: History = (await peekSpotifyCache<History>(HIST_KEY)) ?? { at: 0, artists: {} };
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Map<string, DzArtist>();
  for (const { name } of PINNED) {
    const id = await deezerArtistIdForName(name).catch(() => null);
    if (!id) continue;
    const rel = await deezerGet<{ data?: DzArtist[] }>(`/artist/${id}/related?limit=50`).catch(() => ({ data: [] as DzArtist[] }));
    for (const a of rel.data || []) {
      const fans = a.nb_fan ?? 0;
      if (fans < MIN_FANS || fans > MAX_FANS || pinnedSet.has(a.name.toLowerCase())) continue;
      seen.set(String(a.id), a);
    }
  }
  // Artists already being followed but not related this time keep their
  // history going (up to MAX_TRACKED in all).
  for (const id of Object.keys(hist.artists)) {
    if (seen.has(id) || seen.size >= MAX_TRACKED) continue;
    const a = await deezerGet<DzArtist>(`/artist/${id}`).catch(() => null);
    if (a) seen.set(id, a);
  }
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  const artists: Record<string, Tracked> = {};
  for (const [id, a] of [...seen.entries()].slice(0, MAX_TRACKED)) {
    const old = hist.artists[id];
    const points = (old?.points ?? []).filter(([d]) => d >= cutoff && d !== today);
    points.push([today, a.nb_fan ?? 0]);
    artists[id] = { name: a.name, photo: a.picture_medium ?? old?.photo ?? null, points };
  }
  const next = { at: Date.now(), artists };
  await storeSpotifyCache(HIST_KEY, next, YEAR);
  return next;
}

// Growing steadily: at least a week of history, more fans now than at the
// start of the last two weeks (at least 4% and 25 fans more), and the count
// going up (or holding) on most days.
function rank(hist: History): RisingArtist[] {
  const out: RisingArtist[] = [];
  const since = new Date(Date.now() - 15 * 86400000).toISOString().slice(0, 10);
  for (const a of Object.values(hist.artists)) {
    const pts = a.points.filter(([d]) => d >= since);
    if (pts.length < 2) continue;
    const days = (Date.parse(pts[pts.length - 1][0]) - Date.parse(pts[0][0])) / 86400000;
    if (days < 7) continue;
    const first = pts[0][1], last = pts[pts.length - 1][1];
    if (first <= 0 || last - first < 25) continue;
    const growth = (last - first) / first;
    if (growth < 0.04) continue;
    let up = 0;
    for (let i = 1; i < pts.length; i++) if (pts[i][1] >= pts[i - 1][1]) up++;
    if (up / (pts.length - 1) < 0.7) continue;
    out.push({ name: a.name, photo: a.photo, fans: last, growth: Math.round(growth * 1000) / 10 });
  }
  return out.sort((x, y) => y.growth - x.growth).slice(0, 40);
}

let running = false;
let lastRun = 0;
// Once a day (any process: the last run is stored), never awaited by a
// request: the snapshot, and every two weeks a new list.
export function maybeUpdateRising(): void {
  if (running || Date.now() - lastRun < SNAPSHOT_EVERY_MS) return;
  running = true;
  (async () => {
    const hist = await peekSpotifyCache<History>(HIST_KEY);
    lastRun = Math.max(lastRun, hist?.at ?? 0);
    if (Date.now() - lastRun < SNAPSHOT_EVERY_MS) return;
    lastRun = Date.now();
    const fresh = await inBackground(() => snapshot());
    const list = await peekSpotifyCache<RisingList>(LIST_KEY);
    // A list waits two weeks — unless it came out empty (not enough history
    // yet), then it's tried again with each day's snapshot.
    if (!list || !list.artists.length || Date.now() - list.at >= LIST_EVERY_MS) {
      await storeSpotifyCache(LIST_KEY, { at: Date.now(), artists: rank(fresh) }, YEAR);
    }
  })()
    .catch((err) => logServerError('rising artists', err))
    .finally(() => { running = false; });
}

export type RisingResponse = { pinned: { name: string; id: string; photo: string | null }[]; rising: RisingArtist[] };

// What Discover shows: the picks (a Deezer photo only when the name is
// unique there — "Miley" has namesakes, its photo comes the usual way) and
// the current list.
export async function risingArtists(): Promise<RisingResponse> {
  maybeUpdateRising();
  const [pinned, list] = await Promise.all([
    Promise.all(PINNED.map(async ({ name, id }) => {
      const dz = await deezerArtistByName(name).catch(() => null);
      return { name, id, photo: dz?.exact && (dz.namesakes ?? 1) <= 1 ? dz.photo : null };
    })),
    peekSpotifyCache<RisingList>(LIST_KEY),
  ]);
  return { pinned, rising: (list?.artists ?? []).filter((a) => !pinnedSet.has(a.name.toLowerCase())) };
}
