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

export type RecapPeriod = 'day' | 'month' | 'season';

export type SeasonName = 'winter' | 'spring' | 'summer' | 'autumn';
export type SeasonOption = { key: string; year: number; season: SeasonName };

export type RecapArtistRef = { id: string | null; name: string; cover: string | null };
export type RecapTrackRef = { title: string; artist: string; albumId: string | null; cover: string | null };

export type RecapData = {
  topArtists: RecapArtistRef[];
  topSongs: RecapTrackRef[];
  topGenres: string[];
  minutes: number;
  uniqueArtists: number;
  trackCount: number;
};

export type ApiUser = { id: string; name: string; handle: string; avatarUrl: string | null; isPremium?: boolean };

export type DiscoverMatchPerson = ApiUser & { score: number; sharedAlbums: number };

export type LovedItemType = 'track' | 'album' | 'artist';
export type LovedItem = { id: number; type: LovedItemType; itemId: string | null; title: string; artist: string | null; cover: string | null; createdAt: string };

export type NowPlaying = { title: string; artist: string; cover: string | null; startedAt: string; durationMs: number | null };

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
};

export type Me = PublicProfile & {
  connections: { spotify: boolean; appleMusic: boolean };
  friends: ApiUser[];
  language: import('./i18n').Language;
  region: string | null;
  hasPassword: boolean;
  isPremium: boolean;
  bannerUrl: string | null;
  accentTheme: string | null;
  accentToxicity: string | null;
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
  | 'album'
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
  | 'settings';

export type StatsRange = '4w' | '6m' | 'year' | 'all';

export type StatsData = {
  range: StatsRange;
  hours: number;
  trackCount: number;
  artistCount: number;
  newArtistCount: number;
  avgRating: number;
  peakHour: number | null;
  hoursPerWeek: { weekLabel: string; hours: number }[];
  topArtists: { name: string; id: string | null; cover: string | null; hours: number; plays: number }[];
  heatmap: number[]; // 24 buckets (hour of day), play counts
  genreSplit: { genre: string; pct: number }[];
  recentPlays: { title: string; artist: string; cover: string | null; playedAt: string; trackId: string | null }[];
};

export type GroupSummary = { id: string; name: string; memberCount: number; newPlays: number };
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
export type GroupVoteState = {
  monthKey: string;
  myVote: string | null;
  counts: { user: ApiUser; count: number }[];
};

export type GroupDetail = {
  id: string;
  name: string;
  createdBy: string;
  members: GroupMember[];
  awards: GroupAward[];
  activity: GroupActivityEvent[];
  leaderboard: { user: ApiUser; hours: number }[];
  vote: GroupVoteState;
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
