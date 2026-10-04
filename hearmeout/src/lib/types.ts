export type Album = {
  id: string;
  spotifyId?: string;
  title: string;
  artist: string;
  artistId?: string | null;
  year: number;
  genre: string;
  genreBucket: string;
  cover?: string;
  unknown?: boolean;
  listeners?: string;
  tracklist: string[];
  // Position in a real "most-streamed on Spotify (all-time)" ranking
  // (sourced from kworb.net) — lower is more streamed. Only set on the
  // catalog-expansion batch; used to power "Популярно сейчас" with a real,
  // disclosed ranking instead of Spotify's dev-tier search (which has no
  // trending/charts endpoint available to this app).
  popularRank?: number;
};

// Live aggregate from the `ratings` table (album_ratings view) — replaces
// the prototype's hardcoded Album.rating/ratingsCount.
export type AlbumRatingInfo = { avg: number; count: number };

export type AlbumReview = {
  stars: number;
  review: string;
  user: { name: string; handle: string; avatarUrl: string | null };
};

export type RecapPeriod = 'day' | 'week' | 'month' | 'season';

export type SeasonName = 'winter' | 'spring' | 'summer' | 'autumn';
export type SeasonOption = { key: string; year: number; season: SeasonName };

export type RecapArtistRef = { id: string | null; name: string; cover: string | null; plays: number };
export type RecapTrackRef = { title: string; artist: string; albumId: string | null; cover: string | null; plays: number };
export type RecapGenreShare = { genre: string; pct: number };

export type RecapData = {
  topArtists: RecapArtistRef[];
  topSongs: RecapTrackRef[];
  topGenres: RecapGenreShare[];
  minutes: number;
  uniqueArtists: number;
  trackCount: number;
  // Story card (spec 6.12): artists first heard in this window, average of
  // the ratings given in it (null when none), the award labels won in it
  // (i18n key suffixes under "groups."), and the window itself.
  newArtists: number;
  avgScore: number | null;
  awards: string[];
  range: { start: string; end: string | null };
};

export type ApiUser = { id: string; name: string; handle: string; avatarUrl: string | null };

export type DiscoverMatchPerson = ApiUser & { score: number; sharedAlbums: number };

export type LovedItemType = 'track' | 'album' | 'artist';
export type LovedItem = { id: number; type: LovedItemType; itemId: string | null; title: string; artist: string | null; cover: string | null; createdAt: string };

// Listen later (redesign spec 13.20): a saved album, or a saved track
// (trackIndex into that album's tracklist — null for an album-level save).
export type LaterItemType = 'album' | 'track';
export type LaterItem = { id: number; type: LaterItemType; albumId: string; trackIndex: number | null; title: string; artist: string | null; cover: string | null; createdAt: string };

export type NowPlaying = { title: string; artist: string; cover: string | null; startedAt: string; durationMs: number | null; albumId: string | null };

export type PublicProfile = ApiUser & {
  // True when the viewer isn't the account owner or an accepted friend —
  // every field below is a zeroed/empty stub in that case, not real data.
  locked?: boolean;
  stats: { ratings: number; avg: number; reviews: number };
  genres: { g: string; pct: number }[];
  top4Albums: string[];
  minutesToday: number;
  joinedAt: string;
  nowPlaying: NowPlaying | null;
  // Only populated for the viewer's own profile, or when the viewer is
  // already an accepted friend of this person — lets friends discover
  // mutual connections without exposing a stranger's whole friend graph.
  friends?: ApiUser[];
  recentRatings?: RatingRecord[];
  // Friend-only extras (spec 6.4), same visibility as recentRatings:
  // their most recent play however old (the "last played" tile), when the
  // viewer and this person became friends, and the monthly awards they
  // won this month within their own friend circle (label = i18n key
  // suffix under "groups.", e.g. "awardNightOwl").
  lastPlayed?: NowPlaying | null;
  friendsSince?: string | null;
  awards?: { label: string; detail: string }[];
};

export type Me = PublicProfile & {
  connections: { spotify: boolean; appleMusic: boolean };
  friends: ApiUser[];
  language: import('./i18n').Language;
  region: string | null;
  hasPassword: boolean;
  bannerUrl: string | null;
  isOpenProfile: boolean;
  email: string | null;
  // Redesign appearance settings (persisted on the account; see
  // src/lib/palettes.ts for the types and src/lib/AppContext.tsx for the
  // local-cache-then-account persistence pattern).
  design: import('./palettes').Design;
  mode: import('./palettes').Mode;
  palette: import('./palettes').PaletteId;
  tickerEnabled: boolean;
  motionEnabled: boolean;
  timeFormat: import('./palettes').TimeFormat;
  weekStart: import('./palettes').WeekStart;
  // Redesign privacy switches (settings 7.1). isOpenProfile above is
  // "Private profile" (inverted).
  ratingsVisible: boolean;
  shareLive: boolean;
  publicReviews: boolean;
  discoverable: boolean;
};

export type FriendRequest = { id: number; user: ApiUser; createdAt: string };

// Home feed (redesign spec 6.1, 8 "Feed events"). Album/track metadata is
// resolved on the client from the catalog (same convention as ratings.
// album_id everywhere else in this app) — the server only returns ids.
export type FeedFirstPlayEvent = { type: 'first_play'; user: ApiUser; trackTitle: string; artist: string; at: string };
export type FeedRatingEvent = { type: 'rating_review'; user: ApiUser; albumId: string; stars: number; review: string; at: string };
export type FeedSessionEvent = { type: 'session'; plays: number; minutes: number; at: string };
export type FeedEvent = FeedFirstPlayEvent | FeedRatingEvent | FeedSessionEvent;
export type FeedDisagreement = { friend: ApiUser; albumId: string; mine: number; theirs: number; at: string };
export type FeedResponse = { hero: FeedDisagreement | null; events: FeedEvent[]; recentAlbumIds: string[] };

export type RatingRecord = {
  albumId: string;
  stars: number;
  review: string | null;
  tags: string[];
  createdAt: string;
  isPrivate: boolean;
  previousStars: number | null;
};

export type Device = 'mobile' | 'desktop';

export type ScreenName =
  | 'catalog'
  | 'rate'
  | 'history'
  | 'recap'
  | 'profile'
  | 'artist'
  | 'friend'
  | 'match'
  | 'stats'
  | 'groups'
  | 'group'
  | 'discover'
  | 'settings'
  | 'states'
  | 'later';

// Stats period model (redesign spec 7.5 / Appendix B): only the current and
// previous week/month, and the started seasons of the current calendar
// year, are ever selectable — "winterd" is the spec's December slice of
// winter (shown as its own chip once December starts, distinct from the
// Jan–Feb slice so winter never spans a year boundary the way it does for
// Recap's seasons.ts, which is a deliberately different definition).
export type StatsPeriodType = 'week' | 'month' | 'season';
export type StatsSeasonKey = 'winter' | 'spring' | 'summer' | 'autumn' | 'winterd';
export type StatsSeasonChip = { key: StatsSeasonKey; year: number; label: string; sub: string; current: boolean };

export type StatsCalendarDay = { date: string; minutes: number; tracks: number; topArtist: string | null; future: boolean };

export type StatsData = {
  periodType: StatsPeriodType;
  periodLabel: string;
  periodSub: string;
  comparisonPct: number | null;
  comparisonNote: 'none' | 'first_season' | 'normal';
  hours: number;
  trackCount: number;
  artistCount: number;
  newArtistCount: number;
  avgRating: number;
  topArtists: { name: string; id: string | null; cover: string | null; hours: number; plays: number }[];
  heatmap: number[]; // 24 buckets (hour of day), play counts
  peakHour: number | null;
  genreSplit: { genre: string; pct: number }[];
  bars: { label: string; hours: number; future: boolean }[];
  recentPlays: { title: string; artist: string; cover: string | null; playedAt: string; trackId: string | null }[];
  calendar: {
    days: StatsCalendarDay[];
    activeDays: number;
    totalDays: number;
    longestStreak: number;
    bestDay: { date: string; minutes: number; tracks: number; topArtist: string | null } | null;
  };
  seasonChips: StatsSeasonChip[];
};

export type GroupSummary = { id: string; name: string; memberCount: number; newPlays: number; createdAt: string; members: ApiUser[]; topListener: { user: ApiUser; hours: number } | null };
export type GroupMember = ApiUser;
export type GroupAward = { label: string; winner: ApiUser | null; detail: string };
export type GroupActivityEvent = {
  type: 'rating' | 'review';
  user: ApiUser;
  albumId: string;
  albumTitle: string;
  albumArtist: string;
  cover: string | null;
  stars: number;
  review: string | null;
  createdAt: string;
};
// "Album of the month" candidates (spec 6.6/8): the group's most-rated
// albums this calendar month, voted on by album id — not by member, which
// is what the original site's migration_008 actually built ("monthly
// member voting"). Replaced to match the spec.
export type GroupVoteCandidate = { albumId: string; count: number };
export type GroupVoteState = {
  monthKey: string;
  myVote: string | null;
  candidates: GroupVoteCandidate[];
};

export type GroupLeaderboardPeriod = 'week' | 'month';
export type GroupMemberStats = { userId: string; hoursMonth: number; ratingsMonth: number; streakDays: number; avgScore: number };
export type GroupRecord = { label: string; holder: ApiUser | null; value: string };
export type GroupTopAlbum = { albumId: string; avgScore: number; count: number };
export type GroupTastePair = { a: ApiUser; b: ApiUser; pct: number };
export type GroupTaste = { avgMatch: number | null; closest: GroupTastePair | null; furthest: GroupTastePair | null };
// Past-months awards history (spec gap): each past calendar month's winners,
// recomputed on demand from retained listening_events/ratings — see
// GET /api/groups/[id]. monthKey is "YYYY-MM"; the client formats it with
// the viewer's locale, same convention as vote.monthKey.
export type GroupPastAwards = { monthKey: string; awards: GroupAward[] };

export type GroupDetail = {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  members: GroupMember[];
  memberStats: GroupMemberStats[];
  awards: GroupAward[];
  pastAwards: GroupPastAwards[];
  activity: GroupActivityEvent[];
  leaderboard: { user: ApiUser; hours: number }[];
  leaderboardPeriod: GroupLeaderboardPeriod;
  records: GroupRecord[];
  topAlbums: GroupTopAlbum[];
  taste: GroupTaste | null;
  vote: GroupVoteState;
  // This viewer's own mute state for this group (spec gap) — per
  // group_members row, see migration_018.
  muted: boolean;
};

export type ArtistRelease = {
  id: string;
  title: string;
  'first-release-date'?: string;
};

// Spotify doesn't expose real "monthly listeners" via the public API — only
// follower count and a 0-100 popularity score. Shown as-is, not relabeled.
export type SpotifyArtistAlbum = { id: string; title: string; cover: string | null; releaseDate: string | null; year: number | null };

export type ArtistState = {
  id: string;
  name: string;
  source: 'musicbrainz' | 'spotify';
  loading: boolean;
  error: string | null;
  // musicbrainz-sourced (from the catalog's "open library" search)
  albums: ArtistRelease[] | null;
  // spotify-sourced
  photo?: string | null;
  genres?: string[];
  followers?: number | null;
  popularity?: number | null;
  releasedAlbums?: SpotifyArtistAlbum[];
  upcomingAlbums?: SpotifyArtistAlbum[];
};
