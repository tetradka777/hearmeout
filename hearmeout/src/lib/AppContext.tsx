'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { setNumberLanguage } from './numberFormat';
import { ALBUMS } from './data';
import { normalizeLanguage, pickLanguage, translate, type Language, type TranslationKey } from './i18n';
import { yearRecapOffset, yearRecapOpen } from './yearRecap';
import { useLoadedLanguage } from './useLoadedLanguage';
import { clearStatsCache } from './statsClientCache';
import { jsonAge, peekJson, setJsonCacheOwner, storeJson } from './cachedJson';
import { storeAlbums, storedAlbums } from './albumStore';
import { completedWeekRange } from './weeks';
import type {
  Album, AlbumRatingInfo, AppNotification, ArtistState, Device, FeedResponse, FriendRequest, LaterItem, LovedItem, LovedItemType, Me, RatingRecord, RecapData, RecapPeriod, ScreenName, SeasonOption, SpotifyArtistAlbum,
} from './types';
import type { AlbumDetail } from './spotifyCatalog';
import { resolveMode, type Design, type Mode, type PaletteId, type TimeFormat, type WeekStart } from './palettes';
import { PENDING_INVITE_KEY, PENDING_INVITE_NAME_KEY } from './pendingInvite';


// Full detail (real tracklist + primary artist id) for an on-demand album —
// one recap track, a friend's top-4 pick, an artist's discography entry —
// that isn't already sitting in the local catalog or a loaded home section.
// Artist page requests in flight, by Spotify id (see openSpotifyArtist).
const artistRequests = new Map<string, Promise<unknown>>();

function albumDetailToAlbum(d: AlbumDetail, overrideId?: string): Album {
  // Live data replaces the catalog entry in liveAlbums, so keep the
  // catalog's genre when Spotify has none — an empty bucket here used to
  // drop catalog albums out of the taste fingerprint.
  const catalog = ALBUMS.find((x) => x.id === (overrideId ?? d.id) || x.spotifyId === d.id);
  return {
    id: overrideId ?? d.id,
    spotifyId: d.id,
    title: d.title,
    artist: d.artist,
    artistId: d.artistId,
    year: d.year ?? 0,
    genre: catalog?.genre ?? '',
    genreBucket: catalog?.genreBucket || d.genreBucket || '',
    cover: d.cover ?? undefined,
    tracklist: d.tracklist.map((t) => t.title),
    trackDurations: d.tracklist.map((t) => t.durationMs ?? null),
  };
}

type SortBy = 'year' | 'genre' | 'artist';
type AuthStatus = 'loading' | 'anonymous' | 'ready';

// Every screen — the 7 top-level tabs included — gets a real browser-
// history entry and URL, so the browser's own back/forward buttons work
// everywhere on the site, not just on "content" pages.
const ALL_SCREENS = new Set<ScreenName>([
  'catalog', 'rate', 'history', 'recap', 'profile', 'artist', 'friend', 'match', 'stats', 'groups', 'group', 'fanclub', 'concerts', 'discover', 'settings', 'later',
]);

// What's stored as `history.state` for one entry — enough to restore that
// screen on popstate without re-deriving it from the URL. `hmoDepth` is how
// browser back/forward tell whether there's an in-app entry to actually pop
// to (see goBack/closeRecap below) — it's read back off `history.state`
// itself (not a ref) so it stays correct even after real back/forward.
type ScreenSnapshot = {
  activeScreen: ScreenName;
  hmoDepth: number;
  currentAlbumId?: string;
  viewingUserId?: string;
  viewingGroupId?: string;
  fanClubId?: string;
  fanClubName?: string;
  concertsName?: string;
  concertsArtistId?: string;
  recapViewUserId?: string;
  recapOrigin?: ScreenName;
  artistId?: string;
  artistName?: string;
  artistSource?: 'spotify' | 'musicbrainz';
};

function currentHistoryDepth(): number {
  if (typeof window === 'undefined') return 0;
  return (window.history.state as ScreenSnapshot | null)?.hmoDepth ?? 0;
}

function urlForSnapshot(snap: Omit<ScreenSnapshot, 'hmoDepth'>): string {
  switch (snap.activeScreen) {
    case 'catalog': return '/';
    case 'rate': return `/?screen=rate&id=${encodeURIComponent(snap.currentAlbumId || '')}`;
    case 'friend': return `/?screen=friend&id=${encodeURIComponent(snap.viewingUserId || '')}`;
    case 'group': return `/?screen=group&id=${encodeURIComponent(snap.viewingGroupId || '')}`;
    case 'fanclub': return `/?screen=fanclub&id=${encodeURIComponent(snap.fanClubId || '')}&name=${encodeURIComponent(snap.fanClubName || '')}`;
    case 'concerts': return `/?screen=concerts&name=${encodeURIComponent(snap.concertsName || '')}${snap.concertsArtistId ? `&id=${encodeURIComponent(snap.concertsArtistId)}` : ''}`;
    case 'recap': return `/?screen=recap&id=${encodeURIComponent(snap.recapViewUserId || '')}`;
    case 'artist': return `/?screen=artist&id=${encodeURIComponent(snap.artistId || '')}&source=${snap.artistSource}&name=${encodeURIComponent(snap.artistName || '')}`;
    default: return `/?screen=${snap.activeScreen}`;
  }
}

// Called right after patching a screen into view — adds one entry the
// browser's back button will actually stop on. Every screen goes through
// this, main tabs included: clicking Home → Match → Stats pushes three
// stops, same as any other site's navigation.
function pushScreenHistory(snap: Omit<ScreenSnapshot, 'hmoDepth'>) {
  if (typeof window === 'undefined') return;
  const full: ScreenSnapshot = { ...snap, hmoDepth: currentHistoryDepth() + 1 };
  window.history.pushState(full, '', urlForSnapshot(full));
}
// Keeps an already-pushed entry's stored data fresh in place (e.g. once an
// artist finishes loading, or seeding the very first entry on mount)
// without adding a new one.
function replaceScreenHistory(snap: Omit<ScreenSnapshot, 'hmoDepth'>) {
  if (typeof window === 'undefined') return;
  const full: ScreenSnapshot = { ...snap, hmoDepth: currentHistoryDepth() };
  window.history.replaceState(full, '', urlForSnapshot(full));
}

type AppState = {
  authStatus: AuthStatus;
  language: Language;
  view: Device;
  activeScreen: ScreenName;
  // 'push' (nav tabs, forward links, opening an album/artist/friend/etc.)
  // always opens the destination at its top. 'pop' (an explicit "← Назад"
  // button) restores whatever scroll position the destination was left at.
  // AppShell reads this once per activeScreen change to decide which.
  navAction: 'push' | 'pop';
  currentAlbumId: string;
  viewingUserId: string;
  viewingGroupId: string;
  // The fan club page: the artist's Spotify id and name.
  viewingFanClub: { id: string; name: string } | null;
  // One artist's concerts page (from Discover → concerts).
  viewingConcerts: { name: string; id: string | null } | null;
  recapPeriod: RecapPeriod;
  recapSeasonKey: string | null;
  recapOffset: number;
  recapViewUserId: string;
  recapOrigin: ScreenName;
  // Which screen actually opened History, so its back-crumb and nav
  // highlight can match the prototype's "label by entry point" instead of
  // a hardcoded destination (redesign fix B6). null = opened directly from
  // the nav tab or the quick-rate FAB, not from a specific other screen.
  historyOrigin: 'profile' | 'rate' | null;
  searchQuery: string;
  activeGenre: string;
  sortBy: SortBy;
  ratingValue: number;
  ratingDraftText: string;
  historyQuery: string;
  currentArtist: ArtistState | null;
  toast: string | null;
  // True for the rest of this session right after a fresh signup, so
  // AppGate can show the onboarding wizard once instead of dropping the
  // new account straight into an empty catalog. Never persisted.
  justRegistered: boolean;
};

type AppContextValue = {
  state: AppState;
  language: Language;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  albums: Album[];
  me: Me | null;
  albumRatings: Record<string, AlbumRatingInfo>;
  spotifyCovers: Record<string, string>;
  liveAlbums: Record<string, Album>;
  failedAlbumIds: Record<string, true>;
  myRatings: RatingRecord[];
  feed: FeedResponse | null;
  setFeed: (feed: FeedResponse | null) => void;
  lovedItems: LovedItem[];
  toggleLoved: (type: LovedItemType, title: string, artist?: string | null, itemId?: string | null, cover?: string | null) => Promise<void>;
  laterItems: LaterItem[];
  toggleLaterAlbum: (albumId: string, title: string, artist: string, cover?: string | null) => Promise<void>;
  toggleLaterTrack: (albumId: string, trackIndex: number, title: string, artist: string, cover?: string | null) => Promise<void>;
  removeLaterItem: (id: number) => Promise<boolean>;
  removeAllLater: () => Promise<boolean>;
  friendRequests: { incoming: FriendRequest[]; outgoing: FriendRequest[] };
  recapCache: Record<string, RecapData>;
  recapLocked: Record<string, true>;
  reviewsVersion: number;
  showScreen: (name: ScreenName) => void;
  viewHistory: (origin?: 'profile' | 'rate' | null) => void;
  goBack: (name: ScreenName) => void;
  openAlbum: (id: string) => void;
  viewFriend: (id: string) => void;
  viewGroup: (id: string) => void;
  openFanClub: (id: string, name: string) => void;
  openConcerts: (name: string, id: string | null) => void;
  // `period` switches the recap to that period's latest window (the Home
  // and Stats recap tiles open the weekly recap, spec 6.12); omitted, the
  // screen keeps whatever period it was last on.
  openRecap: (userId: string, period?: RecapPeriod) => void;
  closeRecap: () => void;
  setSearchQuery: (q: string) => void;
  setActiveGenre: (g: string) => void;
  setSortBy: (s: SortBy) => void;
  setHistoryQuery: (q: string) => void;
  setRecapPeriod: (p: RecapPeriod) => void;
  setRecapSeasonKey: (key: string | null) => void;
  setRecapOffset: (o: number) => void;
  recapSeasons: SeasonOption[] | null;
  setRatingValue: (v: number) => void;
  setRatingDraftText: (t: string) => void;
  publishRating: (albumId: string, stars: number, review: string, tags?: string[], isPrivate?: boolean) => Promise<void>;
  ensureRecap: (userId: string, period: RecapPeriod, seasonKey?: string | null, offset?: number) => void;
  registerWithPassword: (name: string, password: string) => Promise<void>;
  dismissOnboarding: (silent?: boolean) => void;
  replayOnboarding: () => void;
  loginWithPassword: (handle: string, password: string) => Promise<void>;
  claimAccount: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutEverywhere: () => Promise<boolean>;
  deleteAccount: () => Promise<boolean>;
  updateProfileName: (name: string) => Promise<boolean>;
  updateProfileHandle: (handle: string) => Promise<boolean>;
  updateAvatar: (dataUrl: string) => Promise<void>;
  updateBanner: (dataUrl: string) => Promise<void>;
  updateLanguage: (language: Language) => Promise<void>;
  updateRegion: (region: string | null) => Promise<void>;
  updateRegionAuto: (regionAuto: boolean) => Promise<void>;
  updateOpenProfile: (isOpenProfile: boolean) => Promise<void>;
  updateAppearance: (updates: Partial<{
    design: Design; mode: Mode; palette: PaletteId; tickerEnabled: boolean; motionEnabled: boolean;
    timeFormat: TimeFormat; weekStart: WeekStart;
  }>) => Promise<void>;
  updatePinnedAlbums: (ids: string[] | null) => Promise<boolean>;
  updatePrivacy: (updates: Partial<{
    ratingsVisible: boolean; shareLive: boolean; publicReviews: boolean; discoverable: boolean;
    notifyReleasesMine: boolean; notifyReleasesPopular: boolean;
  }>) => Promise<void>;
  addFriend: (handle: string) => Promise<void>;
  respondToFriendRequest: (requestId: number, action: 'accept' | 'decline' | 'cancel') => Promise<void>;
  removeFriend: (friendId: string) => Promise<boolean>;
  // In-app notifications (migration 021): a friend's "hi" and shared
  // recaps. Polled together with friend requests.
  notifications: { items: AppNotification[]; unread: number };
  markNotificationsRead: () => Promise<void>;
  sendHi: (friendId: string) => Promise<boolean>;
  shareRecapWithFriends: (period: RecapPeriod, offset: number) => Promise<boolean>;
  syncSpotify: () => Promise<void>;
  onSpotifyConnected: () => Promise<void>;
  importStreamingHistory: (files: File[]) => Promise<{ imported: number; skipped: number; errors: string[] } | null>;
  openArtist: (mbid: string, name: string, fromHistory?: boolean) => Promise<void>;
  openSpotifyArtist: (id: string, name?: string, fromHistory?: boolean) => Promise<void>;
  ensureLiveAlbum: (id: string, spotifyId?: string) => void;
  showToast: (msg: string) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

const initialState: AppState = {
  authStatus: 'loading',
  language: 'en',
  view: 'mobile',
  activeScreen: 'catalog',
  navAction: 'push',
  currentAlbumId: ALBUMS[0]?.id ?? '',
  viewingUserId: '',
  viewingGroupId: '',
  viewingFanClub: null,
  viewingConcerts: null,
  recapPeriod: 'week',
  recapSeasonKey: null,
  recapOffset: 0,
  recapViewUserId: 'me',
  recapOrigin: 'catalog',
  historyOrigin: null,
  searchQuery: '',
  activeGenre: 'all',
  sortBy: 'year',
  ratingValue: 0,
  ratingDraftText: '',
  historyQuery: '',
  currentArtist: null,
  toast: null,
  justRegistered: false,
};

// Chrome doesn't recompute colours written as color-mix(… currentColor …)
// (muted text, hairlines, soft fills — 46 places in components.css) when the
// inherited colour changes: after a light ↔ dark switch muted text kept the
// old theme's colour, dark on dark, until a reload. A moment of display:none
// on the app root makes it recompute everything; the scroll position is
// kept.
function restyleAfterThemeChange(): void {
  const el = document.querySelector<HTMLElement>('.rd');
  if (!el) return;
  const y = window.scrollY;
  const prev = el.style.display;
  el.style.display = 'none';
  void el.offsetHeight;
  el.style.display = prev;
  window.scrollTo(0, y);
}

// Recaps exist only for finished periods — the last week and the one
// before, the last month and the one before, the last two seasons — so a
// period opens on its latest finished window (a month on last month; a
// season is picked on the recap screen). "day" isn't offered any more and
// falls back to the week.
// Recaps are weekly (last week and the week before) plus the year in
// review in December and January: any other period asked for — a Home or
// Stats tile, a ?period= link — opens last week.
function recapWindow(p: RecapPeriod): { recapPeriod: RecapPeriod; recapSeasonKey: null; recapOffset: number } {
  if (p === 'year' && yearRecapOpen()) return { recapPeriod: 'year', recapSeasonKey: null, recapOffset: yearRecapOffset() };
  return { recapPeriod: 'week', recapSeasonKey: null, recapOffset: 0 };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);
  const [me, setMe] = useState<Me | null>(null);
  const [albumRatings, setAlbumRatings] = useState<Record<string, AlbumRatingInfo>>({});
  const [spotifyCovers, setSpotifyCovers] = useState<Record<string, string>>({});
  const [myRatings, setMyRatings] = useState<RatingRecord[]>([]);
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [lovedItems, setLovedItems] = useState<LovedItem[]>([]);
  const [laterItems, setLaterItems] = useState<LaterItem[]>([]);
  const [friendRequests, setFriendRequests] = useState<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>({ incoming: [], outgoing: [] });
  const [notifications, setNotifications] = useState<{ items: AppNotification[]; unread: number }>({ items: [], unread: 0 });
  const [recapCache, setRecapCache] = useState<Record<string, RecapData>>({});
  const [recapLocked, setRecapLocked] = useState<Record<string, true>>({});
  const [reviewsVersion, setReviewsVersion] = useState(0);
  const [fetchedAlbums, setFetchedAlbums] = useState<Record<string, Album>>({});
  const [failedAlbumIds, setFailedAlbumIds] = useState<Record<string, true>>({});
  const requestedAlbumIds = useRef<Set<string>>(new Set());
  // Albums already fetched (this visit or kept from an earlier one): never asked again.
  const knownAlbumIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const kept = storedAlbums();
    const ids = Object.keys(kept);
    if (!ids.length) return;
    for (const id of ids) knownAlbumIds.current.add(id);
    setFetchedAlbums((s) => ({ ...kept, ...s }));
  }, []);
  const requestedRecapKeys = useRef<Set<string>>(new Set());
  // <html lang> as the server set it from Accept-Language, read before the
  // effect below starts mirroring the interface language into it.
  const serverLang = useRef<string | null>(typeof document !== 'undefined' ? document.documentElement.lang : null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors `state` so callbacks that build a history snapshot right after
  // calling setState can read the just-computed value without needing
  // `state` itself in their dependency array (which would recreate them,
  // and every stable-identity callback here is already relied on elsewhere
  // via useCallback deps).
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const patch = useCallback((p: Partial<AppState>) => setState((s) => ({ ...s, ...p })), []);
  // Strings in English until the account language's dictionary has loaded.
  const textLanguage = useLoadedLanguage(state.language);
  const t = useCallback((key: TranslationKey, vars?: Record<string, string | number>) => translate(textLanguage, key, vars), [textLanguage]);

  const showToast = useCallback((msg: string) => {
    patch({ toast: msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => patch({ toast: null }), 1700);
  }, [patch]);

  const refreshMe = useCallback(async () => {
    const res = await fetch('/api/me');
    if (res.status === 401 || res.status === 404) {
      setJsonCacheOwner(null);
      setMe(null);
      // Signed out: the language the server picked from the browser (<html lang>),
      // not always English.
      patch({ authStatus: 'anonymous', language: pickLanguage([serverLang.current || navigator.language]) });
      return;
    }
    if (!res.ok) return;
    const data: Me = await res.json();
    setJsonCacheOwner(data.id);
    storeJson('/api/me', data);
    setMe(data);
    patch({ authStatus: 'ready', language: data.language });
    // Keep the account's time zone current (the evening streak reminder).
    const tz = new Date().getTimezoneOffset();
    if (data.tzOffset !== tz) fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tzOffset: tz }) }).catch(() => {});
  }, [patch]);

  const refreshAlbumRatings = useCallback(async () => {
    // Server-side (the view is closed to the browser's anon key, migration 022).
    // A failed request keeps the averages on screen instead of blanking them.
    const res = await fetch('/api/albums/summary').catch(() => null);
    if (!res?.ok) return;
    const data: { album_id: string; avg_stars: number; ratings_count: number }[] = await res.json().catch(() => null);
    if (!Array.isArray(data)) return;
    const map: Record<string, AlbumRatingInfo> = {};
    for (const row of data) {
      map[row.album_id as string] = { avg: Number(row.avg_stars), count: Number(row.ratings_count) };
    }
    storeJson('/api/albums/summary', data);
    setAlbumRatings(map);
  }, []);

  const refreshMyRatings = useCallback(async () => {
    const res = await fetch('/api/ratings/mine');
    if (!res.ok) return;
    const data = await res.json();
    storeJson('/api/ratings/mine', data);
    setMyRatings(data);
  }, []);

  const refreshLovedItems = useCallback(async () => {
    const res = await fetch('/api/loved');
    if (!res.ok) return;
    const data = await res.json();
    storeJson('/api/loved', data);
    setLovedItems(data.items || []);
  }, []);

  const toggleLoved = useCallback(async (type: LovedItemType, title: string, artist?: string | null, itemId?: string | null, cover?: string | null) => {
    const res = await fetch('/api/loved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, title, artist: artist ?? null, itemId: itemId ?? null, cover: cover ?? null }),
    });
    if (!res.ok) return;
    await refreshLovedItems();
  }, [refreshLovedItems]);

  const refreshLater = useCallback(async () => {
    const res = await fetch('/api/later');
    if (!res.ok) return;
    const data = await res.json();
    storeJson('/api/later', data);
    setLaterItems(data.items || []);
  }, []);

  const toggleLaterAlbum = useCallback(async (albumId: string, title: string, artist: string, cover?: string | null) => {
    const res = await fetch('/api/later', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'album', albumId, title, artist, cover: cover ?? null }),
    });
    if (!res.ok) return;
    const { saved } = await res.json();
    await refreshLater();
    showToast(saved ? t('toast.albumSavedLater') : t('toast.removedLater'));
  }, [refreshLater, showToast, t]);

  const toggleLaterTrack = useCallback(async (albumId: string, trackIndex: number, title: string, artist: string, cover?: string | null) => {
    const res = await fetch('/api/later', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'track', albumId, trackIndex, title, artist, cover: cover ?? null }),
    });
    if (!res.ok) return;
    const { saved } = await res.json();
    await refreshLater();
    showToast(saved ? t('toast.trackSavedLater') : t('toast.removedLater'));
  }, [refreshLater, showToast, t]);

  const removeLaterItem = useCallback(async (id: number) => {
    const res = await fetch(`/api/later/${id}`, { method: 'DELETE' });
    if (!res.ok) return false;
    await refreshLater();
    return true;
  }, [refreshLater]);

  const removeAllLater = useCallback(async () => {
    const res = await fetch('/api/later', { method: 'DELETE' });
    if (!res.ok) return false;
    await refreshLater();
    return true;
  }, [refreshLater]);

  const outgoingIdsRef = useRef<Set<number>>(new Set());
  const refreshFriendRequests = useCallback(async () => {
    const res = await fetch('/api/friends/requests');
    if (!res.ok) return;
    const data: { incoming: FriendRequest[]; outgoing: FriendRequest[] } = await res.json();
    // An outgoing request that disappeared was accepted (or declined) on
    // the other side — reload `me` so a new friend shows up without a reload.
    const nowOut = new Set(data.outgoing.map((r) => r.id));
    const resolved = [...outgoingIdsRef.current].some((id) => !nowOut.has(id));
    outgoingIdsRef.current = nowOut;
    setFriendRequests(data);
    if (resolved) refreshMe();
  }, [refreshMe]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => patch({ view: mq.matches ? 'mobile' : 'desktop' });
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [patch]);

  // Start from the last session's copy (lib/cachedJson) so a returning
  // visitor sees their account, ratings and lists at once; the requests
  // below replace it, and /api/me signs out if the session is gone.
  useEffect(() => {
    const cachedMe = peekJson<Me>('/api/me');
    if (cachedMe) {
      setMe(cachedMe);
      patch({ authStatus: 'ready', language: normalizeLanguage(cachedMe.language) });
      const ratings = peekJson<RatingRecord[]>('/api/ratings/mine');
      if (ratings) setMyRatings(ratings);
      const loved = peekJson<{ items?: LovedItem[] }>('/api/loved');
      if (loved) setLovedItems(loved.items || []);
      const later = peekJson<{ items?: LaterItem[] }>('/api/later');
      if (later) setLaterItems(later.items || []);
      const covers = peekJson<Record<string, string>>('/api/spotify/covers');
      if (covers) setSpotifyCovers(covers);
      const summary = peekJson<{ album_id: string; avg_stars: number; ratings_count: number }[]>('/api/albums/summary');
      if (summary) setAlbumRatings(Object.fromEntries(summary.map((r) => [r.album_id, { avg: Number(r.avg_stars), count: Number(r.ratings_count) }])));
    }
    refreshMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { refreshAlbumRatings(); }, [refreshAlbumRatings]);
  useEffect(() => {
    fetch('/api/spotify/covers')
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => { if (d) { storeJson('/api/spotify/covers', d); setSpotifyCovers(d); } })
      .catch(() => {});
  }, []);

  useEffect(() => { if (state.authStatus === 'ready') refreshMyRatings(); }, [state.authStatus, refreshMyRatings]);
  useEffect(() => { if (state.authStatus === 'ready') refreshLovedItems(); }, [state.authStatus, refreshLovedItems]);
  useEffect(() => { if (state.authStatus === 'ready') refreshLater(); }, [state.authStatus, refreshLater]);

  // <html lang> follows the interface language (screen readers, hyphenation,
  // quotes); the server layout starts it from Accept-Language.
  useEffect(() => { document.documentElement.lang = state.language; }, [state.language]);
  // Number formatting (fmt1) reads the language synchronously, so set it
  // during render, before any screen formats a score.
  setNumberLanguage(state.language);

  // Redesign appearance: applies as soon as `me` loads (the layout's inline
  // script already applied the cached values before hydration, so there's
  // no flash — this effect just keeps the root in sync with the account's
  // real settings and re-applies live when "system" mode's OS preference
  // changes while the app is open).
  // The album page is always dark, whatever the theme: the mode follows the
  // open screen too.
  const albumOpen = state.activeScreen === 'rate';
  useEffect(() => {
    if (!me) return;
    const root = document.documentElement;
    const modeNow = () => (albumOpen ? 'dark' : resolveMode(me.mode));
    const themeKey = () => `${root.dataset.design}|${root.dataset.palette}|${root.dataset.mode}`;
    const before = themeKey();
    root.dataset.design = me.design;
    root.dataset.palette = me.palette;
    root.dataset.mode = modeNow();
    if (before !== themeKey()) restyleAfterThemeChange();
    try {
      localStorage.setItem('hmo-appearance', JSON.stringify({
        design: me.design, mode: me.mode, palette: me.palette, motionEnabled: me.motionEnabled,
      }));
    } catch { /* ignore */ }

    // Motion is off when the account setting says so OR the OS asks for
    // reduced motion — the OS preference always wins over an account that
    // merely never touched the toggle, and this re-applies live if the OS
    // setting changes while the app is open (same pattern as the "system"
    // color-scheme listener below).
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const applyMotion = () => {
      if (!me.motionEnabled || motionQuery.matches) root.dataset.motion = 'off';
      else delete root.dataset.motion;
    };
    applyMotion();
    motionQuery.addEventListener('change', applyMotion);

    let colorSchemeQuery: MediaQueryList | null = null;
    let onColorSchemeChange: (() => void) | null = null;
    if (me.mode === 'system') {
      colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
      onColorSchemeChange = () => { root.dataset.mode = modeNow(); restyleAfterThemeChange(); };
      colorSchemeQuery.addEventListener('change', onColorSchemeChange);
    }
    return () => {
      motionQuery.removeEventListener('change', applyMotion);
      if (colorSchemeQuery && onColorSchemeChange) colorSchemeQuery.removeEventListener('change', onColorSchemeChange);
    };
  }, [me, albumOpen]);

  // Friend requests arrive from other people, so they're re-checked when the
  // tab becomes visible again and once a minute while it's visible — not
  // only at sign-in (a request sent while you're on the page used to stay
  // invisible until a reload). Drives the "new requests" badge.
  useEffect(() => {
    if (state.authStatus !== 'ready') return;
    const refreshInbox = () => {
      refreshFriendRequests();
      fetch('/api/notifications').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setNotifications(d); }).catch(() => {});
    };
    refreshInbox();
    const onVisible = () => { if (document.visibilityState === 'visible') refreshInbox(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const timer = setInterval(onVisible, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      clearInterval(timer);
    };
  }, [state.authStatus, refreshFriendRequests]);

  // Completes an invite-link visit (see app/invite/[id]/page.tsx) that
  // happened while logged out: that page stashes the inviter's id in
  // localStorage before sending the visitor to "/" to sign up, and once
  // auth is actually ready here, we send the friend request they started.
  // Spec 13.x: it's a normal pending request (both sides see it as
  // pending), not an instant friendship — unless the inviter had already
  // requested this person, in which case /api/friends accepts it.
  useEffect(() => {
    if (state.authStatus !== 'ready') return;
    let pendingId: string | null = null;
    try { pendingId = localStorage.getItem(PENDING_INVITE_KEY); } catch { /* ignore */ }
    if (!pendingId) return;
    try { localStorage.removeItem(PENDING_INVITE_KEY); localStorage.removeItem(PENDING_INVITE_NAME_KEY); } catch { /* ignore */ }
    fetch('/api/friends', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: pendingId }) })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.status === 'accepted') { showToast(t('toast.friendAdded')); refreshMe(); }
        else if (data?.status === 'pending') { showToast(t('toast.friendRequestSent')); refreshFriendRequests(); }
      })
      .catch(() => {});
  }, [state.authStatus, showToast, t, refreshMe, refreshFriendRequests]);

  const registerWithPassword = useCallback(async (name: string, password: string) => {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: null }));
      throw new Error(err.error || 'signup_failed');
    }
    await refreshMe();
    patch({ justRegistered: true });
  }, [refreshMe, patch]);

  const dismissOnboarding = useCallback((silent?: boolean) => { patch({ justRegistered: false }); if (!silent) showToast(t('onboarding.allSetToast')); }, [patch, showToast, t]);
  // Settings -> Account's "Replay" row (prototype: data-go="onboarding"
  // data-ob0="1") — OnboardingScreen's own step state is a plain useState
  // that starts at 1, so remounting it via justRegistered is enough to
  // restart from the first step.
  const replayOnboarding = useCallback(() => patch({ justRegistered: true }), [patch]);

  const loginWithPassword = useCallback(async (handle: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: null }));
      throw new Error(err.error || 'login_failed');
    }
    await refreshMe();
  }, [refreshMe]);

  const claimAccount = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: null }));
      throw new Error(err.error || 'claim_failed');
    }
    await refreshMe();
  }, [refreshMe]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setJsonCacheOwner(null);
    setMe(null);
    patch({ authStatus: 'anonymous' });
  }, [patch]);

  // Signs out every device, this one included (/api/auth/logout-all).
  const logoutEverywhere = useCallback(async (): Promise<boolean> => {
    const res = await fetch('/api/auth/logout-all', { method: 'POST' }).catch(() => null);
    if (!res?.ok) return false;
    setJsonCacheOwner(null);
    setMe(null);
    patch({ authStatus: 'anonymous' });
    return true;
  }, [patch]);

  const deleteAccount = useCallback(async (): Promise<boolean> => {
    const res = await fetch('/api/me', { method: 'DELETE' });
    if (!res.ok) return false;
    setJsonCacheOwner(null);
    setMe(null);
    patch({ authStatus: 'anonymous' });
    return true;
  }, [patch]);

  const showScreen = useCallback((name: ScreenName) => {
    patch({ activeScreen: name, navAction: 'push' });
    // Re-clicking the tab you're already on doesn't push a duplicate stop.
    if (stateRef.current.activeScreen !== name) pushScreenHistory({ activeScreen: name });
  }, [patch]);
  // History doubles as both a top-level nav destination and a screen
  // opened from Profile or Rate — the crumb label, its target and whether
  // the nav lights up "Rate" all depend on which (redesign fix B6).
  const viewHistory = useCallback((origin: 'profile' | 'rate' | null = null) => {
    patch({ historyOrigin: origin });
    showScreen('history');
  }, [patch, showScreen]);
  // Real browser back (when there's an in-app entry to return to) instead
  // of jumping straight to `name` — lets a "← Back" button and the
  // browser's own back button land you on exactly the same place, since
  // they now go through the same popstate path. `name` is only used as a
  // fallback for a page that was deep-linked straight into a detail screen,
  // where there's nothing in our own history to pop back through.
  const goBack = useCallback((name: ScreenName) => {
    if (currentHistoryDepth() > 0) window.history.back();
    else patch({ activeScreen: name, navAction: 'pop' });
  }, [patch]);
  // The prototype has no separate album-browsing screen — vRate() in
  // reference/app.js is the one page that shows the cover, tracklist,
  // friends' ratings and community stats alongside the rating widget
  // itself, always live (no "open the rating form" click-through). Every
  // "go look at this album" link in the prototype is the same
  // data-go="rate" data-a="<id>", so there's just one function here too.
  const openAlbum = useCallback((id: string) => {
    setState((s) => {
      const existing = myRatings.find((r) => r.albumId === id);
      return {
        ...s,
        currentAlbumId: id,
        ratingValue: existing ? existing.stars : 0,
        ratingDraftText: existing ? existing.review || '' : '',
        activeScreen: 'rate',
        navAction: 'push',
      };
    });
    pushScreenHistory({ activeScreen: 'rate', currentAlbumId: id });
  }, [myRatings]);

  const viewFriend = useCallback((id: string) => {
    patch({ viewingUserId: id, activeScreen: 'friend', navAction: 'push' });
    pushScreenHistory({ activeScreen: 'friend', viewingUserId: id });
  }, [patch]);
  const openFanClub = useCallback((id: string, name: string) => {
    patch({ viewingFanClub: { id, name }, activeScreen: 'fanclub', navAction: 'push' });
    pushScreenHistory({ activeScreen: 'fanclub', fanClubId: id, fanClubName: name });
  }, [patch]);
  const openConcerts = useCallback((name: string, id: string | null) => {
    patch({ viewingConcerts: { name, id }, activeScreen: 'concerts', navAction: 'push' });
    pushScreenHistory({ activeScreen: 'concerts', concertsName: name, concertsArtistId: id ?? undefined });
  }, [patch]);
  const viewGroup = useCallback((id: string) => {
    patch({ viewingGroupId: id, activeScreen: 'group', navAction: 'push' });
    pushScreenHistory({ activeScreen: 'group', viewingGroupId: id });
  }, [patch]);
  const openRecap = useCallback((userId: string, period?: RecapPeriod) => {
    const origin = stateRef.current.activeScreen;
    const periodPatch = period ? recapWindow(period) : {};
    setState((s) => ({ ...s, ...periodPatch, recapViewUserId: userId, recapOrigin: origin, activeScreen: 'recap', navAction: 'push' }));
    pushScreenHistory({ activeScreen: 'recap', recapViewUserId: userId, recapOrigin: origin });
  }, []);
  const closeRecap = useCallback(() => {
    if (currentHistoryDepth() > 0) { window.history.back(); return; }
    setState((s) => ({ ...s, activeScreen: s.recapOrigin || 'catalog', navAction: 'pop' }));
  }, []);

  const setSearchQuery = useCallback((q: string) => patch({ searchQuery: q }), [patch]);
  const setActiveGenre = useCallback((g: string) => patch({ activeGenre: g }), [patch]);
  const setSortBy = useCallback((sVal: SortBy) => patch({ sortBy: sVal }), [patch]);
  const setHistoryQuery = useCallback((q: string) => patch({ historyQuery: q }), [patch]);
  const setRecapPeriod = useCallback((p: RecapPeriod) => patch(recapWindow(p)), [patch]);
  const setRecapSeasonKey = useCallback((key: string | null) => patch({ recapSeasonKey: key }), [patch]);
  const setRecapOffset = useCallback((o: number) => patch({ recapOffset: o }), [patch]);
  const setRatingValue = useCallback((v: number) => patch({ ratingValue: v }), [patch]);

  // The slider and the review follow the album on screen however it was
  // opened — a link, a reload, back/forward used to keep "–" (or the
  // previous album's score) — and pick up the saved score once the ratings
  // arrive, unless the person already started on this one.
  const ratingFormAlbum = useRef<string | null>(null);
  useEffect(() => {
    const id = state.currentAlbumId;
    const existing = myRatings.find((r) => r.albumId === id);
    if (ratingFormAlbum.current !== id) {
      ratingFormAlbum.current = id;
      patch({ ratingValue: existing ? existing.stars : 0, ratingDraftText: existing ? existing.review || '' : '' });
      return;
    }
    if (existing && state.ratingValue === 0 && !state.ratingDraftText) patch({ ratingValue: existing.stars, ratingDraftText: existing.review || '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentAlbumId, myRatings]);
  const setRatingDraftText = useCallback((t: string) => patch({ ratingDraftText: t }), [patch]);

  const ensureRecap = useCallback((userId: string, period: RecapPeriod, seasonKey?: string | null, offset = 0) => {
    const targetId = userId === 'me' ? me?.id : userId;
    if (!targetId) return;
    const key = `${targetId}:${period}${seasonKey ? ':' + seasonKey : offset ? ':' + offset : ''}`;
    if (requestedRecapKeys.current.has(key)) return;
    requestedRecapKeys.current.add(key);
    const seasonQS = seasonKey ? `&season=${encodeURIComponent(seasonKey)}` : offset ? `&offset=${offset}` : '';
    // Weeks follow the *viewer's* week-start setting, so a friend's recap
    // chips line up with your own.
    // The week is named by its start date too, so last week's stored copy
    // (lib/cachedJson) is never shown as this week's; tz = this device's
    // clock, which decides when a day, week and month turn over.
    const weekQS = period === 'week'
      ? `&weekStart=${me?.weekStart ?? 'mon'}&wk=${completedWeekRange(offset, me?.weekStart ?? 'mon').start.toISOString().slice(0, 10)}`
      : '';
    const url = `/api/recap?period=${period}&userId=${targetId}${seasonQS}${weekQS}&tz=${new Date().getTimezoneOffset()}`;
    // The stored copy shows at once; the request below refreshes it.
    const stored = peekJson<RecapData>(url);
    if (stored) setRecapCache((s) => ({ ...s, [key]: stored }));
    fetch(url)
      .then((res) => {
        // A friend's recap is just another view into their listening data
        // (same friends-only boundary as their profile) — vRecap() in the
        // prototype has a dedicated locked state for this, not an endless
        // spinner.
        if (res.status === 403) { setRecapLocked((s) => ({ ...s, [key]: true })); return null; }
        return res.ok ? res.json() : null;
      })
      .then((data: RecapData | null) => {
        if (data) { storeJson(url, data); setRecapCache((s) => ({ ...s, [key]: data })); }
        else requestedRecapKeys.current.delete(key);
      })
      .catch(() => requestedRecapKeys.current.delete(key));
  }, [me]);

  // Season chips per person, kept for the session: opening the season recap
  // again (or a refresh of `me`) no longer blanks and reloads them.
  const [seasonsByUser, setSeasonsByUser] = useState<Record<string, SeasonOption[]>>({});
  const recapSeasonsTarget = state.recapViewUserId === 'me' ? me?.id : state.recapViewUserId;
  const recapSeasons = recapSeasonsTarget ? seasonsByUser[recapSeasonsTarget] ?? null : null;
  useEffect(() => {
    // Loaded ahead of time (not only once the Season chip is picked).
    const targetId = recapSeasonsTarget;
    if (!targetId || seasonsByUser[targetId]) return;
    let cancelled = false;
    fetch(`/api/recap/seasons?userId=${targetId}`)
      .then((res) => (res.ok ? res.json() : { seasons: [] }))
      .then((data: { seasons: SeasonOption[] }) => { if (!cancelled) setSeasonsByUser((s) => ({ ...s, [targetId]: data.seasons })); })
      .catch(() => { if (!cancelled) setSeasonsByUser((s) => ({ ...s, [targetId]: [] })); });
    return () => { cancelled = true; };
  }, [state.activeScreen, state.recapPeriod, recapSeasonsTarget, seasonsByUser]);

  // Posting/saving-privately never navigates away (the prototype's own
  // post/priv click handlers just re-render the same vRate() page in
  // place) — the rate screen is a persistent, always-live surface you can
  // keep revising, not a form that closes on submit.
  const publishRating = useCallback(async (albumId: string, stars: number, review: string, tags: string[] = [], isPrivate: boolean = false) => {
    const isEditing = myRatings.some((r) => r.albumId === albumId);
    const res = await fetch('/api/ratings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ albumId, stars, review, tags, isPrivate }),
    });
    if (!res.ok) {
      showToast(t('toast.ratingSaveFailed'));
      return;
    }
    await Promise.all([refreshMyRatings(), refreshAlbumRatings(), refreshMe()]);
    setReviewsVersion((v) => v + 1);
    // Rating an album removes it from Listen later (spec 13.20 rule 2) —
    // tracks stay, so this only ever matches the album-level entry.
    const laterMatch = laterItems.find((i) => i.type === 'album' && i.albumId === albumId);
    const removedFromLater = laterMatch ? await removeLaterItem(laterMatch.id) : false;
    if (removedFromLater) {
      showToast(isPrivate ? t('toast.savedPrivatelyRemovedLater') : t('toast.publishedRemovedLater'));
    } else {
      showToast(isPrivate ? t('toast.savedPrivately') : isEditing ? t('toast.ratingUpdated') : t('toast.published'));
    }
  }, [myRatings, refreshMyRatings, refreshAlbumRatings, refreshMe, showToast, t, laterItems, removeLaterItem]);

  // Redesign fix (item 20): the sign-up modal already enforces name length
  // (2-24) and surfaces server errors — the profile screen's own inline
  // name/handle fields didn't, so a too-short name or a taken handle just
  // silently reverted on refreshMe() with no explanation. Returns whether
  // the save stuck, so the caller can put the field back the way it was.
  const updateProfileName = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 24) {
      showToast(t('profile.nameLengthError'));
      return false;
    }
    const res = await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: trimmed }) });
    if (!res.ok) { showToast(t('profile.nameSaveFailed')); return false; }
    await refreshMe();
    showToast(t('profile.nameSaved'));
    return true;
  }, [refreshMe, showToast, t]);

  const updateProfileHandle = useCallback(async (handle: string) => {
    const trimmed = handle.trim().replace(/^@/, '');
    if (trimmed.length < 3 || trimmed.length > 20) {
      showToast(t('profile.handleLengthError'));
      return false;
    }
    const res = await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: trimmed }) });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      showToast(data?.error === 'handle_taken' ? t('profile.handleTaken') : t('profile.handleSaveFailed'));
      return false;
    }
    await refreshMe();
    showToast(t('profile.handleSaved'));
    return true;
  }, [refreshMe, showToast, t]);

  const updateAvatar = useCallback(async (dataUrl: string) => {
    await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ avatarUrl: dataUrl }) });
    await refreshMe();
  }, [refreshMe]);

  const updateBanner = useCallback(async (dataUrl: string) => {
    await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bannerUrl: dataUrl }) });
    await refreshMe();
  }, [refreshMe]);

  const updateLanguage = useCallback(async (language: Language) => {
    patch({ language });
    setMe((prev) => (prev ? { ...prev, language } : prev));
    await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language }) });
  }, [patch]);

  const updateRegion = useCallback(async (region: string | null) => {
    setMe((prev) => (prev ? { ...prev, region } : prev));
    await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ region }) });
  }, []);

  // "Detect from my streaming account": turning it on switches the region
  // to the detected country right away (the server does the same).
  const updateRegionAuto = useCallback(async (regionAuto: boolean) => {
    setMe((prev) => (prev ? { ...prev, regionAuto, region: regionAuto && prev.detectedRegion ? prev.detectedRegion : prev.region } : prev));
    const res = await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ regionAuto }) });
    if (!res.ok) { setMe((prev) => (prev ? { ...prev, regionAuto: !regionAuto } : prev)); showToast(t('settings.regionAutoFailed')); return; }
    // Turning it on may have just asked Spotify for the country.
    if (regionAuto) await refreshMe();
  }, [showToast, t, refreshMe]);

  const updateOpenProfile = useCallback(async (isOpenProfile: boolean) => {
    setMe((prev) => (prev ? { ...prev, isOpenProfile } : prev));
    await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isOpenProfile }) });
  }, []);

  const updateAppearance = useCallback(async (updates: Partial<{
    design: Design; mode: Mode; palette: PaletteId; tickerEnabled: boolean; motionEnabled: boolean;
    timeFormat: TimeFormat; weekStart: WeekStart;
  }>) => {
    setMe((prev) => (prev ? { ...prev, ...updates } : prev));
    await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
  }, []);

  const updatePrivacy = useCallback(async (updates: Partial<{
    ratingsVisible: boolean; shareLive: boolean; publicReviews: boolean; discoverable: boolean;
    notifyReleasesMine: boolean; notifyReleasesPopular: boolean;
  }>) => {
    setMe((prev) => (prev ? { ...prev, ...updates } : prev));
    await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
  }, []);

  // Profile top 4 by hand (null = automatic). True when it was saved.
  const updatePinnedAlbums = useCallback(async (ids: string[] | null): Promise<boolean> => {
    let before: string[] | null = null;
    setMe((m) => { before = m?.pinnedAlbums ?? null; return m ? { ...m, pinnedAlbums: ids && ids.length ? ids.slice(0, 4) : null } : m; });
    const res = await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pinnedAlbums: ids }) }).catch(() => null);
    // Not saved: back to what was there.
    if (!res?.ok) setMe((m) => (m ? { ...m, pinnedAlbums: before } : m));
    return !!res?.ok;
  }, []);

  const addFriend = useCallback(async (handle: string) => {
    const res = await fetch('/api/friends', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.error === 'already_friends') showToast(t('toast.friendAlreadyAdded'));
      else if (data.error === 'not_found') showToast(t('toast.friendNotFound'));
      else showToast(t('toast.friendAddFailed'));
      return;
    }
    if (data.status === 'accepted') {
      await refreshMe();
      showToast(t('toast.friendAdded'));
    } else {
      await refreshFriendRequests();
      showToast(t('toast.friendRequestSent'));
    }
  }, [refreshMe, refreshFriendRequests, showToast, t]);

  const respondToFriendRequest = useCallback(async (requestId: number, action: 'accept' | 'decline' | 'cancel') => {
    const res = await fetch('/api/friends/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, action }),
    });
    if (!res.ok) {
      showToast(t('toast.friendRequestFailed'));
      return;
    }
    await Promise.all([refreshFriendRequests(), action === 'accept' ? refreshMe() : Promise.resolve()]);
    showToast(action === 'accept' ? t('toast.friendAdded') : action === 'cancel' ? t('toast.friendRequestCancelled') : t('toast.friendRequestDeclined'));
  }, [refreshFriendRequests, refreshMe, showToast, t]);

  // Returns whether it worked so the caller can keep its confirm UI open on
  // failure; toasts either way.
  const markNotificationsRead = useCallback(async () => {
    setNotifications((n) => ({ items: n.items.map((i) => ({ ...i, read: true })), unread: 0 }));
    await fetch('/api/notifications/read', { method: 'POST' }).catch(() => {});
  }, []);

  // Both return whether it was delivered and toast either way; a 429 means
  // the cooldown (one hi per friend per hour, one recap share per day).
  const sendHi = useCallback(async (friendId: string) => {
    const res = await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'hi', to: friendId }) });
    showToast(t(res.ok ? 'notify.hiSent' : res.status === 429 ? 'notify.hiTooSoon' : 'notify.failed'));
    return res.ok;
  }, [showToast, t]);

  const shareRecapWithFriends = useCallback(async (period: RecapPeriod, offset: number) => {
    const res = await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'recap', period, offset }) });
    if (!res.ok) { showToast(t(res.status === 429 ? 'notify.recapTooSoon' : 'notify.failed')); return false; }
    const { sent } = await res.json();
    showToast(sent ? t('notify.recapSent', { count: sent }) : t('notify.noFriends'));
    return sent > 0;
  }, [showToast, t]);

  const removeFriend = useCallback(async (friendId: string) => {
    const res = await fetch('/api/friends', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ friendId }) });
    if (!res.ok) { showToast(t('toast.friendRemoveFailed')); return false; }
    await Promise.all([refreshMe(), refreshFriendRequests()]);
    showToast(t('toast.friendRemoved'));
    return true;
  }, [refreshFriendRequests, refreshMe, showToast, t]);

  const syncSpotify = useCallback(async () => {
    const res = await fetch('/api/sync', { method: 'POST' });
    if (!res.ok) {
      showToast(t('toast.syncFailed'));
      return;
    }
    const { imported } = await res.json();
    showToast(imported > 0 ? t('toast.syncedTracks', { count: imported }) : t('toast.syncNoNew'));
    requestedRecapKeys.current.clear();
    setRecapCache({});
    clearStatsCache();
  }, [showToast, t]);

  const onSpotifyConnected = useCallback(async () => {
    requestedRecapKeys.current.clear();
    setRecapCache({});
    await refreshMe();
  }, [refreshMe]);

  const importStreamingHistory = useCallback(async (files: File[]) => {
    const form = new FormData();
    for (const f of files) form.append('files', f);
    const res = await fetch('/api/spotify/import', { method: 'POST', body: form });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.error === 'file_too_large') showToast(t('toast.importFileTooLarge', { file: data.file || '' }));
      else if (data.error === 'too_many_files') showToast(t('toast.importTooManyFiles'));
      else showToast(t('toast.importFailed'));
      return null;
    }
    const result = await res.json();
    requestedRecapKeys.current.clear();
    setRecapCache({});
    await refreshMe();
    showToast(result.imported > 0 ? t('toast.importedTracks', { count: result.imported }) : t('toast.importNoNew'));
    return result;
  }, [showToast, t, refreshMe]);

  // `id` is what the rest of the app looks the album up by (a catalog slug
  // like "ok-computer", or a raw Spotify id for anything sourced live).
  // `spotifyId` is what to actually fetch — for catalog albums that's a
  // different value than `id`; for everything else they're the same.
  //
  // Requests are gathered for a moment and sent together (a wall of covers
  // is one request, not one per album), and every album that came back is
  // kept in the browser (lib/albumStore) for the next visit.
  const albumQueue = useRef<Map<string, string>>(new Map());
  const albumQueueTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const albumRetries = useRef<Map<string, number>>(new Map());
  const flushAlbumRef = useRef<() => void>(() => {});
  const flushAlbumQueue = useCallback(() => {
    albumQueueTimer.current = null;
    const batch = [...albumQueue.current.entries()];
    albumQueue.current.clear();
    for (let i = 0; i < batch.length; i += 60) {
      const part = batch.slice(i, i + 60);
      fetch('/api/spotify/albums', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: part.map(([, target]) => target) }) })
        .then((res) => (res.ok ? res.json() : null))
        .then((d: { albums?: Record<string, AlbumDetail | null>; pending?: string[] } | null) => {
          const got: Record<string, Album> = {};
          const failed: string[] = [];
          const pending = new Set(d?.pending || []);
          for (const [id, target] of part) {
            const detail = d?.albums?.[target];
            // Still loading on the server (the known albums came back
            // without waiting for it): asked again shortly, a few times.
            const tries = albumRetries.current.get(id) ?? 0;
            if (!detail && pending.has(target) && tries < 4) {
              albumRetries.current.set(id, tries + 1);
              albumQueue.current.set(id, target);
              if (!albumQueueTimer.current) albumQueueTimer.current = setTimeout(() => flushAlbumRef.current(), 800);
              continue;
            }
            albumRetries.current.delete(id);
            requestedAlbumIds.current.delete(id);
            if (detail) got[id] = albumDetailToAlbum(detail, id);
            else failed.push(id);
          }
          if (Object.keys(got).length) {
            setFetchedAlbums((s) => ({ ...s, ...got }));
            setFailedAlbumIds((s) => { if (!Object.keys(got).some((id) => id in s)) return s; const n = { ...s }; for (const id of Object.keys(got)) delete n[id]; return n; });
            for (const id of Object.keys(got)) knownAlbumIds.current.add(id);
            storeAlbums(got);
          }
          if (failed.length) setFailedAlbumIds((s) => ({ ...s, ...Object.fromEntries(failed.map((id) => [id, true as const])) }));
        })
        .catch(() => {
          for (const [id] of part) requestedAlbumIds.current.delete(id);
          setFailedAlbumIds((s) => ({ ...s, ...Object.fromEntries(part.map(([id]) => [id, true as const])) }));
        });
    }
  }, []);

  useEffect(() => { flushAlbumRef.current = flushAlbumQueue; }, [flushAlbumQueue]);

  const ensureLiveAlbum = useCallback((id: string, spotifyId?: string) => {
    if (!id || requestedAlbumIds.current.has(id) || knownAlbumIds.current.has(id)) return;
    // A catalog slug is fetched by its Spotify id (callers often pass only
    // the slug); anything else that isn't a Spotify id can't be fetched.
    const target = spotifyId || ALBUMS.find((x) => x.id === id)?.spotifyId || id;
    if (!/^[0-9A-Za-z]{22}$/.test(target)) { setFailedAlbumIds((s) => (id in s ? s : { ...s, [id]: true })); return; }
    requestedAlbumIds.current.add(id);
    albumQueue.current.set(id, target);
    if (!albumQueueTimer.current) albumQueueTimer.current = setTimeout(flushAlbumQueue, 30);
  }, [flushAlbumQueue]);

  // `fromHistory` is set only when the popstate handler below is replaying
  // a browser back/forward into an artist page — the fetch still needs to
  // happen (artist detail isn't cached in history.state), but it mustn't
  // push *another* entry on top of the one the user just navigated to.
  // The caller passes the artist's name when it has one, so the page header
  // (and the URL, for reloads) shows it even if Spotify then fails.
  const openSpotifyArtist = useCallback(async (id: string, knownName?: string, fromHistory = false) => {
    setState((s) => ({
      ...s,
      currentArtist: { id, name: knownName || (s.currentArtist?.id === id ? s.currentArtist.name : ''), source: 'spotify', albums: null, loading: true, error: null },
      activeScreen: 'artist',
      navAction: 'push',
    }));
    if (!fromHistory) pushScreenHistory({ activeScreen: 'artist', artistId: id, artistName: knownName || '', artistSource: 'spotify' });
    // The last copy of this artist's page (kept in the browser) shows at
    // once; the request below refreshes it.
    type ArtistData = { name: string; photo?: string | null; genres?: string[]; fans?: number | null; releasedAlbums?: SpotifyArtistAlbum[]; upcomingAlbums?: SpotifyArtistAlbum[]; limited?: boolean };
    const storeKey = `/api/spotify/artist/${id}`;
    const apply = (data: ArtistData) => setState((s) => ({
      ...s,
      currentArtist: s.currentArtist && s.currentArtist.id === id
        ? {
          ...s.currentArtist,
          name: data.name,
          photo: data.photo,
          genres: data.genres,
          fans: data.fans,
          releasedAlbums: data.releasedAlbums,
          upcomingAlbums: data.upcomingAlbums,
          loading: false,
          error: null,
        }
        : s.currentArtist,
    }));
    const stored = peekJson<ArtistData>(storeKey);
    if (stored) apply(stored);
    // A copy under a minute old needs no request at all.
    if (stored && (jsonAge(storeKey) ?? Infinity) < 60_000) {
      replaceScreenHistory({ activeScreen: 'artist', artistId: id, artistName: stored.name, artistSource: 'spotify' });
      return;
    }
    try {
      // The same artist asked for again while its request is out (restoring
      // from the URL can call this several times) shares that request.
      let req = artistRequests.get(id);
      if (!req) {
        req = fetch(`${storeKey}${knownName ? `?name=${encodeURIComponent(knownName)}` : ''}`)
          .then(async (res) => {
            if (!res.ok) throw new Error(res.status === 503 ? 'rate_limited' : String(res.status));
            return await res.json() as ArtistData;
          })
          .finally(() => { artistRequests.delete(id); });
        artistRequests.set(id, req);
      }
      const data = await req as ArtistData;
      // A partial page (Spotify busy) doesn't replace a full copy.
      if (!(data.limited && stored)) apply(data);
      if (!data.limited) storeJson(storeKey, data);
      replaceScreenHistory({ activeScreen: 'artist', artistId: id, artistName: data.name, artistSource: 'spotify' });
    } catch (err) {
      if (stored) return;
      const message = err instanceof Error && err.message === 'rate_limited' ? t('artist.rateLimited') : t('artist.loadError');
      setState((s) => ({
        ...s,
        currentArtist: s.currentArtist && s.currentArtist.id === id
          ? { ...s.currentArtist, loading: false, error: message }
          : s.currentArtist,
      }));
    }
  }, [t]);

  const openArtist = useCallback(async (mbid: string, name: string, fromHistory = false) => {
    setState((s) => ({
      ...s,
      currentArtist: { id: mbid, name, source: 'musicbrainz', albums: null, loading: true, error: null },
      activeScreen: 'artist',
      navAction: 'push',
    }));
    if (!fromHistory) pushScreenHistory({ activeScreen: 'artist', artistId: mbid, artistName: name, artistSource: 'musicbrainz' });
    try {
      const { fetchArtistReleaseGroups } = await import('./musicbrainz');
      const releaseGroups = await fetchArtistReleaseGroups(mbid);
      setState((s) => ({
        ...s,
        currentArtist: s.currentArtist && s.currentArtist.id === mbid
          ? { ...s.currentArtist, albums: releaseGroups, loading: false }
          : s.currentArtist,
      }));
    } catch {
      const isFileProtocol = typeof location !== 'undefined' && location.protocol === 'file:';
      const message = isFileProtocol ? t('artist.fileProtocolError') : t('artist.loadError');
      setState((s) => ({
        ...s,
        currentArtist: s.currentArtist && s.currentArtist.id === mbid
          ? { ...s.currentArtist, loading: false, error: message }
          : s.currentArtist,
      }));
    }
  }, [t]);

  // Makes the browser's own back/forward buttons work everywhere: restores
  // whatever ScreenSnapshot a push/replace call earlier attached to that
  // history entry. Also handles landing directly on a screen's URL (a
  // shared link, or refreshing the page) by parsing the query string the
  // same way, since there's no history.state yet in that case.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const restore = (snap: ScreenSnapshot | null) => {
      // `snap` can be a truthy object with none of our fields — Next.js's
      // own router patches history.state with its own internal tracking
      // data, and the very first entry (from before this app ever touched
      // history) only has that, not a ScreenSnapshot.
      if (!snap?.activeScreen) { setState((s) => ({ ...s, activeScreen: 'catalog', navAction: 'pop' })); return; }
      if (snap.activeScreen === 'artist' && snap.artistId) {
        if (snap.artistSource === 'musicbrainz') openArtist(snap.artistId, snap.artistName || '', true);
        else openSpotifyArtist(snap.artistId, snap.artistName, true);
        return;
      }
      setState((s) => ({
        ...s,
        activeScreen: snap.activeScreen,
        currentAlbumId: snap.currentAlbumId ?? s.currentAlbumId,
        viewingUserId: snap.viewingUserId ?? s.viewingUserId,
        viewingGroupId: snap.viewingGroupId ?? s.viewingGroupId,
        viewingFanClub: snap.fanClubId ? { id: snap.fanClubId, name: snap.fanClubName || '' } : s.viewingFanClub,
        viewingConcerts: snap.concertsName ? { name: snap.concertsName, id: snap.concertsArtistId ?? null } : s.viewingConcerts,
        recapViewUserId: snap.recapViewUserId ?? s.recapViewUserId,
        recapOrigin: snap.recapOrigin ?? s.recapOrigin,
        navAction: 'pop',
      }));
    };

    const onPopState = (e: PopStateEvent) => restore(e.state as ScreenSnapshot | null);
    window.addEventListener('popstate', onPopState);

    // Next.js's own router already populates history.state with its own
    // internal tracking object before this effect ever runs (even on a
    // fresh load), so checking for the absence of history.state entirely
    // never actually triggers — check for the absence of *our* field.
    if (!(window.history.state as ScreenSnapshot | null)?.activeScreen) {
      const params = new URLSearchParams(window.location.search);
      const screen = params.get('screen') as ScreenName | null;
      if (screen && ALL_SCREENS.has(screen)) {
        const id = params.get('id') ?? undefined;
        // The id belongs to the linked screen only: every screen stays
        // mounted, so handing it to all of them had the group screen ask for
        // a group with a user's id, the recap ask for a "user" with a
        // group's id, and so on (404/403s on every deep link).
        const only = (s: ScreenName) => (screen === s ? id : undefined);
        restore({
          activeScreen: screen,
          hmoDepth: 0,
          currentAlbumId: only('rate'),
          viewingUserId: only('friend'),
          viewingGroupId: only('group'),
          fanClubId: only('fanclub'),
          fanClubName: screen === 'fanclub' ? params.get('name') ?? undefined : undefined,
          concertsName: screen === 'concerts' ? params.get('name') ?? undefined : undefined,
          concertsArtistId: only('concerts'),
          recapViewUserId: only('recap'),
          artistId: only('artist'),
          artistName: params.get('name') ?? undefined,
          artistSource: (params.get('source') as 'spotify' | 'musicbrainz' | null) ?? undefined,
        });
        // A recap link may name its period (the weekly recap push does).
        const period = params.get('period');
        if (screen === 'recap' && (period === 'day' || period === 'week' || period === 'month' || period === 'season' || period === 'year')) {
          setState((s) => ({ ...s, ...recapWindow(period) }));
        }
      } else {
        // No deep link — seed this very first entry with a real snapshot
        // too, so going back to it later restores 'catalog' the normal way
        // instead of relying on the no-activeScreen fallback above.
        replaceScreenHistory({ activeScreen: 'catalog' });
      }
    }

    return () => window.removeEventListener('popstate', onPopState);
  }, [openArtist, openSpotifyArtist]);

  const liveAlbums = useMemo(() => {
    const map: Record<string, Album> = {};
    for (const [id, a] of Object.entries(fetchedAlbums)) map[id] = a;
    return map;
  }, [fetchedAlbums]);

  const value = useMemo<AppContextValue>(() => ({
    state, language: state.language, t, albums: ALBUMS, me, albumRatings, spotifyCovers, liveAlbums, failedAlbumIds,
    myRatings, feed, setFeed, lovedItems, toggleLoved, laterItems, toggleLaterAlbum, toggleLaterTrack, removeLaterItem, removeAllLater, friendRequests, recapCache, recapLocked, reviewsVersion,
    showScreen, viewHistory, goBack, openAlbum, viewFriend, viewGroup, openFanClub, openConcerts, openRecap, closeRecap,
    setSearchQuery, setActiveGenre, setSortBy, setHistoryQuery, setRecapPeriod, setRecapSeasonKey, setRecapOffset, recapSeasons,
    setRatingValue, setRatingDraftText, publishRating, ensureRecap,
    registerWithPassword, dismissOnboarding, replayOnboarding, loginWithPassword, claimAccount, logout, logoutEverywhere, deleteAccount,
    updateProfileName, updateProfileHandle, updateAvatar, updateBanner, updateLanguage, updateRegion, updateRegionAuto, updateOpenProfile, updateAppearance, updatePrivacy, updatePinnedAlbums,
    addFriend, respondToFriendRequest, removeFriend, notifications, markNotificationsRead, sendHi, shareRecapWithFriends, syncSpotify, onSpotifyConnected, importStreamingHistory, openArtist, openSpotifyArtist, ensureLiveAlbum, showToast,
  }), [state, t, me, albumRatings, spotifyCovers, liveAlbums, failedAlbumIds,
    myRatings, feed, setFeed, lovedItems, toggleLoved, laterItems, toggleLaterAlbum, toggleLaterTrack, removeLaterItem, removeAllLater, friendRequests, recapCache, recapLocked, reviewsVersion, showScreen, viewHistory, goBack, openAlbum,
    setRecapSeasonKey, setRecapOffset, recapSeasons,
    viewFriend, viewGroup, openFanClub, openConcerts, openRecap, closeRecap, setSearchQuery, setActiveGenre, setSortBy, setHistoryQuery,
    setRecapPeriod, setRatingValue, setRatingDraftText, publishRating, ensureRecap,
    registerWithPassword, dismissOnboarding, replayOnboarding, loginWithPassword, claimAccount, logout, logoutEverywhere, deleteAccount,
    updateProfileName, updateProfileHandle, updateAvatar, updateBanner, updateLanguage, updateRegion, updateRegionAuto, updateOpenProfile, updateAppearance, updatePrivacy, updatePinnedAlbums,
    addFriend, respondToFriendRequest, removeFriend, notifications, markNotificationsRead, sendHi, shareRecapWithFriends, syncSpotify, onSpotifyConnected, importStreamingHistory, openArtist, openSpotifyArtist, ensureLiveAlbum, showToast]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
