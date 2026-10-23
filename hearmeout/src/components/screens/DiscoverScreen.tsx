'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArtistAvatar, ArtistName } from '../ui/ArtistName';
import { fmt1 } from '@/lib/numberFormat';
import { useApp } from '@/lib/AppContext';
import type { Album, Device, DiscoverMatchPerson } from '@/lib/types';
import { userAvatarStyle } from '@/lib/format';
import { CoverArt } from '../ui/CoverArt';
import { AlbumShelfCard, ReviewCard, Shelf } from '../ui/SuperCards';
import { FanClubsForYou } from '../FanClubs';
import { regionDisplayName } from '@/lib/i18n';
import { LiveLibrarySearch } from '../LiveLibrarySearch';
import { PopularNowSection } from '../PopularNowSection';
import { ConcertsFeed } from '../ConcertsFeed';
import { ObscureAlbums } from '../ObscureAlbums';
import { GenreTopArtists } from '../GenreTopArtists';
import { MascotIcon } from '../redesign/icons';
import { cachedJson, peekJson, cachedPage } from '@/lib/cachedJson';
import { usePaged } from '@/lib/usePaged';

// Discover: this is where the old Home/catalog-browser content lives now
// (redesign spec 13.3 — "Discover is where the old catalog lives"). Empty
// query shows the browse sections (genre chips, popular now, top rated,
// lesser-known artists, genre tops, full catalog+sort, reviews worth
// reading); a query shows album/artist/people/open-library results.

const GENRES = ['all', 'Rock', 'Hip-Hop', 'Electronic', 'R&B', 'Pop', 'Latin'];
type Filter = 'all' | 'albums' | 'artists' | 'people';

type PersonResult = { id: string; name: string; handle: string; avatarUrl: string | null; score?: number; sharedAlbums?: number };

function PersonRow({ person }: { person: PersonResult }) {
  const { t, me, friendRequests, addFriend, viewFriend } = useApp();
  if (!me) return null;
  const isMe = person.id === me.id;
  const isFriend = me.friends.some((f) => f.id === person.id);
  const isPending = friendRequests.outgoing.some((r) => r.user.id === person.id);
  return (
    <div className="row">
      <button className="rowlink" onClick={() => viewFriend(person.id)}>
        <span className="dot" style={userAvatarStyle(person)}>{!person.avatarUrl && person.name[0]}</span>
        <span className="g">
          <b>{person.name}</b>
          <small className="muted" style={{ fontWeight: 600 }}>
            @{person.handle.replace(/^@/, '')}{person.score != null ? ` · ${t('match.discoverRowSubtitle', { score: person.score, count: person.sharedAlbums ?? 0 })}` : ''}
          </small>
        </span>
      </button>
      {isMe ? null : isFriend ? (
        <span className="tag">{t('friend.friendsTag')}</span>
      ) : isPending ? (
        <span className="tag">{t('friend.requestSent')}</span>
      ) : (
        <button className="btn" style={{ padding: '8px 16px' }} onClick={() => addFriend(person.handle)}>{t('friend.addFriend')}</button>
      )}
    </div>
  );
}

// Artist search results: derived from our own curated catalog (same source
// as Top Rated) since that's the only place we have real community scores
// per artist. Clicking resolves a real Spotify artist id on demand (like
// LiveLibrarySearch's album resolve) so the row opens a real artist page.
function ArtistChip({ name, avg }: { name: string; avg: number | null }) {
  const { t, openSpotifyArtist, showToast } = useApp();
  const [resolving, setResolving] = useState(false);
  return (
    <button
      className="row"
      style={{ opacity: resolving ? 0.6 : 1 }}
      onClick={async () => {
        if (resolving) return;
        setResolving(true);
        try {
          const res = await fetch(`/api/spotify/resolve-artist?name=${encodeURIComponent(name)}`);
          if (!res.ok) { showToast(t('toast.artistOpenFailed')); return; }
          const { id } = await res.json();
          openSpotifyArtist(id, name);
        } catch {
          showToast(t('toast.artistOpenFailed'));
        } finally {
          setResolving(false);
        }
      }}
    >
      <ArtistAvatar name={name} size={44} />
      <span className="g"><b>{name}</b></span>
      {avg != null && <b className="num" style={{ fontSize: 22, color: 'var(--acct)' }}>{fmt1(avg)}</b>}
    </button>
  );
}

// Search results as rows (rev 10c/11): cover, title, artist · year, the
// community score and your own.
function AlbumRow({ album: a }: { album: Album }) {
  const { t, albumRatings, myRatings, spotifyCovers, openAlbum } = useApp();
  const score = albumRatings[a.id]?.avg;
  const mine = myRatings.find((r) => r.albumId === a.id)?.stars;
  return (
    <button className="row alr10" onClick={() => openAlbum(a.id)}>
      <CoverArt url={spotifyCovers[a.id] || a.cover} fallbackLetter={a.artist[0] || '?'} className="cov" px={48} style={{ width: 48, height: 48 }} />
      <span className="g"><b>{a.title}</b><small className="muted"><ArtistName name={a.artist} id={a.artistId} size={16} /> · {a.year}</small></span>
      {score != null && <b className="num" style={{ fontSize: 22, color: 'var(--acct)' }}>{fmt1(score)}</b>}
      {mine != null && <span className="tag on9">{t('stats.youRated', { score: fmt1(mine) })}</span>}
    </button>
  );
}

type SiteReview = { stars: number; review: string; tags?: string[]; createdAt: string; albumId: string; user: { id?: string; name: string; handle: string; avatarUrl: string | null } };

// Albums outside the static catalog are looked up as they near the screen.
function useEnsureAlbums(ids: string[]) {
  const { albums, liveAlbums, failedAlbumIds, ensureLiveAlbum } = useApp();
  const key = ids.join(',');
  useEffect(() => {
    for (const id of ids) {
      if (liveAlbums[id] || failedAlbumIds[id] || albums.some((a) => a.id === id || a.spotifyId === id)) continue;
      ensureLiveAlbum(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

// "Reviews worth reading": the site's latest public reviews, an endless
// shelf of review cards (/api/reviews/recent, a page at a time).
function SiteReviewsShelf() {
  const { t, albums, liveAlbums, failedAlbumIds } = useApp();
  const { items, done, failed, more } = usePaged<SiteReview, number>(async (from) => {
    const d = await cachedPage<{ reviews: SiteReview[]; next: number | null }>(`/api/reviews/recent?from=${from ?? 0}`);
    return { items: d.reviews, next: d.next };
  }, (r) => `${r.user.id || r.user.handle}|${r.albumId}`, [], 50);
  useEnsureAlbums(items.map((r) => r.albumId));
  const known = (id: string) => !!liveAlbums[id] || albums.some((a) => a.id === id || a.spotifyId === id);
  const shown = items.filter((r) => known(r.albumId));
  if (!shown.length) {
    const waiting = !failed && (!done || items.some((r) => !failedAlbumIds[r.albumId]));
    return (
      <section className="sh14">
        <div className="hd"><h2>{t('discover.reviewsWorthReading')}</h2></div>
        <p className="muted" style={{ fontWeight: 600 }}>{waiting ? t('reviews.loading') : t('reviews.empty')}</p>
      </section>
    );
  }
  return (
    <Shelf title={t('discover.reviewsWorthReading')} onMore={more} done={done} className="rvs15">
      {shown.map((r) => (
        <ReviewCard key={`${r.user.id || r.user.handle}|${r.albumId}`} user={r.user} createdAt={r.createdAt} stars={r.stars} review={r.review} tags={r.tags} albumId={r.albumId} />
      ))}
    </Shelf>
  );
}

const MIN_RATINGS_FOR_TOP = 3;
const TOP_STEP = 25;

// "Top rated": every album rated on the site, the ones with 3+ ratings
// first (by average), then the rest; 50 at first, more as the shelf
// scrolls. Albums outside the catalog are fetched as they come into range.
function TopRatedShelf({ genre }: { genre: string }) {
  const { t, albums, liveAlbums, failedAlbumIds, albumRatings, spotifyCovers, openAlbum } = useApp();
  const [limit, setLimit] = useState(50);
  const ranked = useMemo(() => Object.entries(albumRatings)
    .sort(([, a], [, b]) => Number(b.count >= MIN_RATINGS_FOR_TOP) - Number(a.count >= MIN_RATINGS_FOR_TOP) || b.avg - a.avg || b.count - a.count)
    .map(([id]) => id), [albumRatings]);
  const albumOf = (id: string) => liveAlbums[id] || albums.find((a) => a.id === id || a.spotifyId === id);
  const usable = ranked.filter((id) => !failedAlbumIds[id]);
  const range = usable.slice(0, (limit + 10) * (genre === 'all' ? 1 : 4));
  useEnsureAlbums(range);
  const list = range
    .map((id) => ({ id, a: albumOf(id) }))
    .filter((x): x is { id: string; a: Album } => !!x.a && (genre === 'all' || x.a.genreBucket === genre))
    .slice(0, limit);
  const done = limit >= usable.length;
  if (!list.length) {
    return (
      <section className="sh14">
        <div className="hd"><h2>{t('catalog.topRated')}</h2></div>
        <div className="tile t-soft2 empty"><MascotIcon /><p className="muted" style={{ fontWeight: 600 }}>{t('catalog.topRatedEmpty', { n: MIN_RATINGS_FOR_TOP })}</p></div>
      </section>
    );
  }
  return (
    <Shelf title={t('catalog.topRated')} onMore={() => setLimit((n) => n + TOP_STEP)} done={done}>
      {list.map(({ id, a }, i) => (
        <AlbumShelfCard
          key={id}
          cover={spotifyCovers[a.id] || a.cover}
          title={a.title}
          artist={a.artist}
          artistId={a.artistId}
          badge={`#${i + 1}`}
          meta={`★ ${fmt1(albumRatings[id].avg)} · ${t('groups.ratingsN', { n: albumRatings[id].count })}`}
          onClick={() => openAlbum(a.id)}
        />
      ))}
    </Shelf>
  );
}

export function DiscoverScreen(_props: { device: Device }) {
  const { t, language, me, state, albums, albumRatings, setSearchQuery, setActiveGenre, showScreen } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const [people, setPeople] = useState<PersonResult[] | null>(null);
  const [mbFound, setMbFound] = useState<boolean | null>(null);
  const [discoverPeople, setDiscoverPeople] = useState<DiscoverMatchPerson[] | null>(() => peekJson<{ people: DiscoverMatchPerson[] }>('/api/match/discover')?.people ?? null);

  const query = state.searchQuery;
  const q = query.trim().toLowerCase();
  const genreFilter = state.activeGenre;
  const showLive = q.length >= 2;

  useEffect(() => {
    setMbFound(null);
    // People are only part of the "all" and "people" segments (redesign
    // fix B25) — this used to check the opposite, so the People chip never
    // actually searched and stayed on "Searching…" forever.
    if (!showLive || (filter !== 'all' && filter !== 'people')) { setPeople(null); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/users/search?q=${encodeURIComponent(query.trim())}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => { if (!cancelled) setPeople(d); });
    }, 220);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, showLive, filter]);

  useEffect(() => {
    if (!me || showLive) return;
    let cancelled = false;
    cachedJson<{ people: DiscoverMatchPerson[] }>('/api/match/discover').then((d) => { if (!cancelled) setDiscoverPeople(d?.people ?? []); });
    return () => { cancelled = true; };
  }, [me, showLive]);

  const albumResults = useMemo(() => {
    if (!q) return [];
    return albums.filter((a) => (a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)) && (genreFilter === 'all' || a.genreBucket === genreFilter));
  }, [albums, q, genreFilter]);

  const artistResults = useMemo(() => {
    if (!q) return [];
    const byName = new Map<string, { name: string; sum: number; count: number; genres: Set<string> }>();
    for (const a of albums) {
      const key = a.artist.toLowerCase();
      const entry = byName.get(key) || { name: a.artist, sum: 0, count: 0, genres: new Set<string>() };
      entry.genres.add(a.genreBucket);
      const r = albumRatings[a.id];
      if (r) { entry.sum += r.avg; entry.count += 1; }
      byName.set(key, entry);
    }
    return [...byName.values()]
      .filter((e) => e.name.toLowerCase().includes(q) && (genreFilter === 'all' || e.genres.has(genreFilter)))
      .map((e) => ({ name: e.name, avg: e.count ? e.sum / e.count : null }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [albums, albumRatings, q, genreFilter]);

  if (!me) return null;

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: t('discover.filterAll') },
    { key: 'albums', label: t('discover.filterAlbums') },
    { key: 'artists', label: t('discover.filterArtists') },
    { key: 'people', label: t('discover.filterPeople') },
  ];

  const regionLabel = me.region ? regionDisplayName(me.region, language) : t('discover.globalRegion');

  const albumsContribute = filter === 'all' || filter === 'albums';
  const artistsContribute = filter === 'all' || filter === 'artists';
  const peopleContribute = filter === 'all' || filter === 'people';
  const mbContributes = filter !== 'people' && showLive;

  const peopleLoading = peopleContribute && people === null;
  const mbLoading = mbContributes && mbFound === null;
  const stillLoading = peopleLoading || mbLoading;

  const hasAlbums = albumsContribute && albumResults.length > 0;
  const hasArtists = artistsContribute && artistResults.length > 0;
  const hasPeople = peopleContribute && !!people && people.length > 0;
  const hasMb = mbContributes && mbFound === true;
  const anyResults = hasAlbums || hasArtists || hasPeople || hasMb;
  const showNothingFound = showLive && !stillLoading && !anyResults;

  return (
    <>
      {/* Search first (after Superfan); the page title stays for screen readers. */}
      <h1 className="sr">{t('discover.title')}</h1>
      <input className="field srch14" type="search" placeholder={t('discover.searchPlaceholder')} aria-label={t('discover.searchAria')} value={query} onChange={(e) => setSearchQuery(e.target.value)} />
      <div className="chips" role="group" aria-label={t('discover.whatToShow')}>
        {FILTERS.map((f) => (
          <button key={f.key} className={`chip ${filter === f.key ? 'on' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>
      <div className="chips" role="group" aria-label={t('discover.genreAria')}>
        {GENRES.map((g) => (
          <button key={g} className={`chip ${g === genreFilter ? 'on' : ''}`} onClick={() => setActiveGenre(g)}>
            {g === 'all' ? t('catalog.genreAll') : g}
          </button>
        ))}
      </div>
      <p className="muted" style={{ fontWeight: 600, margin: '-4px 0 22px' }}>
        {t('discover.picksForPrefix')} <b>{regionLabel}</b>. <button className="link" onClick={() => showScreen('settings')}>{t('discover.changeRegion')}</button>
      </p>

      {showLive ? (
        <>
          {hasAlbums && (
            <>
              <h2>{t('discover.albumsHeading')}</h2>
              <div className="tile">{albumResults.map((a) => <AlbumRow key={a.id} album={a} />)}</div>
            </>
          )}
          {hasArtists && (
            <>
              <h2 style={{ marginTop: 26 }}>{t('discover.artistsHeading')}</h2>
              <div className="tile t-soft2">{artistResults.map((a) => <ArtistChip key={a.name} name={a.name} avg={a.avg} />)}</div>
            </>
          )}
          {peopleContribute && hasPeople && (
            <>
              <h2 style={{ marginTop: 26 }}>{t('discover.people')}</h2>
              <div className="tile">{(people as PersonResult[]).map((p) => <PersonRow key={p.id} person={p} />)}</div>
            </>
          )}
          {mbContributes && mbFound !== false && (
            <>
              <h2 style={{ marginTop: 26 }}>{t('discover.openLibraryHeading')}</h2>
              <p className="muted" style={{ fontWeight: 600, margin: '-6px 0 12px' }}>{t('discover.openLibrarySubtitle')}</p>
              <LiveLibrarySearch key={query.trim()} query={query.trim()} onResult={setMbFound} />
            </>
          )}
          {stillLoading && !anyResults && <p className="muted">{t('discover.searching')}</p>}
          {showNothingFound && (
            <div className="tile t-soft2 empty">
              <MascotIcon />
              <h3>{t('discover.nothingFoundTitle')}</h3>
              <p className="muted">{t('discover.nothingFoundDesc', { query: query.trim() })}</p>
            </div>
          )}
        </>
      ) : filter === 'people' ? (
        <>
          <h2>{t('discover.peopleYouMayKnow')}</h2>
          <div className="tile">
            {discoverPeople === null ? <p className="muted" style={{ fontWeight: 600 }}>{t('discover.searching')}</p>
              : discoverPeople.length ? discoverPeople.map((p) => <PersonRow key={p.id} person={p} />)
              : <p className="muted" style={{ fontWeight: 600 }}>{t('match.allFriendsMatched')}</p>}
          </div>
        </>
      ) : (
        <>
          {/* Shelves of big cards (after Superfan's search page). */}
          {filter !== 'artists' && <PopularNowSection genre={genreFilter} />}

          {filter !== 'albums' && <FanClubsForYou />}

          {filter !== 'albums' && <ConcertsFeed />}

          {filter !== 'artists' && <TopRatedShelf genre={genreFilter} />}

          {filter !== 'artists' && <SiteReviewsShelf />}

          {filter !== 'albums' && <GenreTopArtists onlyGenre={genreFilter} sub={regionLabel} />}

          {filter !== 'albums' && <ObscureAlbums genre={genreFilter === 'all' ? 'Electronic' : genreFilter} sub={`${genreFilter === 'all' ? 'Electronic' : genreFilter} · ${t('discover.obscureSubtitle', { region: regionLabel })}`} />}

        </>
      )}
    </>
  );
}
