'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArtistAvatar, ArtistName } from '../ui/ArtistName';
import { fmt1 } from '@/lib/numberFormat';
import { useApp } from '@/lib/AppContext';
import type { Album, Device, DiscoverMatchPerson } from '@/lib/types';
import { userAvatarStyle } from '@/lib/format';
import { CoverArt } from '../ui/CoverArt';
import { AlbumShelfCard, ReviewCard, Shelf } from '../ui/SuperCards';
import { regionDisplayName } from '@/lib/i18n';
import { LiveLibrarySearch } from '../LiveLibrarySearch';
import { PopularNowSection } from '../PopularNowSection';
import { ConcertsFeed } from '../ConcertsFeed';
import { ObscureAlbums } from '../ObscureAlbums';
import { GenreTopArtists } from '../GenreTopArtists';
import { MascotIcon } from '../redesign/icons';
import { cachedJson, peekJson } from '@/lib/cachedJson';

// Discover: this is where the old Home/catalog-browser content lives now
// (redesign spec 13.3 — "Discover is where the old catalog lives"). Empty
// query shows the browse sections (genre chips, popular now, top rated,
// lesser-known artists, genre tops, full catalog+sort, reviews worth
// reading); a query shows album/artist/people/open-library results.

const GENRES = ['Всё', 'Rock', 'Hip-Hop', 'Electronic', 'R&B', 'Pop', 'Latin'];
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

function SiteReviewsBlock() {
  const { t, albums, liveAlbums } = useApp();
  const [reviews, setReviews] = useState<SiteReview[] | null>(() => peekJson<{ reviews: SiteReview[] }>('/api/reviews/recent')?.reviews ?? null);

  useEffect(() => {
    let cancelled = false;
    // Server-side: no private ratings, respects "Public reviews".
    cachedJson<{ reviews: SiteReview[] }>('/api/reviews/recent').then((d) => { if (!cancelled) setReviews(d?.reviews ?? []); });
    return () => { cancelled = true; };
  }, []);

  if (reviews === null) return <p className="muted" style={{ fontWeight: 600 }}>{t('reviews.loading')}</p>;
  const resolved = reviews
    .map((r) => ({ r, a: liveAlbums[r.albumId] || albums.find((x) => x.id === r.albumId) }))
    .filter((x): x is { r: SiteReview; a: NonNullable<typeof x.a> } => !!x.a)
    .slice(0, 5);
  if (!resolved.length) return <p className="muted" style={{ fontWeight: 600 }}>{t('reviews.empty')}</p>;

  return (
    <div className="stack">
      {resolved.slice(0, 3).map(({ r, a }, i) => (
        <ReviewCard key={i} user={r.user} createdAt={r.createdAt} stars={r.stars} review={r.review} tags={r.tags} albumId={a.id} />
      ))}
    </div>
  );
}

export function DiscoverScreen(_props: { device: Device }) {
  const { t, language, me, state, albums, albumRatings, spotifyCovers, openAlbum, setSearchQuery, setActiveGenre, setSortBy, showScreen, myRatings } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  // Full catalog in pages (it used to render every album at once, ~10,000px).
  const [catalogAll, setCatalogAll] = useState(false);
  const [people, setPeople] = useState<PersonResult[] | null>(null);
  const [mbFound, setMbFound] = useState<boolean | null>(null);
  const [discoverPeople, setDiscoverPeople] = useState<DiscoverMatchPerson[] | null>(() => peekJson<{ people: DiscoverMatchPerson[] }>('/api/match/discover')?.people ?? null);

  const query = state.searchQuery;
  const q = query.trim().toLowerCase();
  const genreFilter = state.activeGenre;
  const showLive = q.length >= 2;

  const SORT_OPTIONS: { key: 'year' | 'genre' | 'artist'; label: string }[] = [
    { key: 'year', label: t('catalog.sortYear') },
    { key: 'genre', label: t('catalog.sortGenre') },
    { key: 'artist', label: t('catalog.sortArtist') },
  ];

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
    return albums.filter((a) => (a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)) && (genreFilter === 'Всё' || a.genreBucket === genreFilter));
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
      .filter((e) => e.name.toLowerCase().includes(q) && (genreFilter === 'Всё' || e.genres.has(genreFilter)))
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

  // Real data, small real userbase: the prototype's demo data gates "top
  // rated" at 30+ ratings (meaningless here), so this uses a minimum that's
  // still reachable while filtering out albums with just one or two scores.
  const MIN_RATINGS_FOR_TOP = 3;
  const topRatedFiltered = albums
    .filter((a) => albumRatings[a.id] && albumRatings[a.id].count >= MIN_RATINGS_FOR_TOP && (genreFilter === 'Всё' || a.genreBucket === genreFilter))
    .sort((a, b) => albumRatings[b.id].avg - albumRatings[a.id].avg)
    .slice(0, 4);

  const catalogFiltered = genreFilter === 'Всё' ? albums : albums.filter((a) => a.genreBucket === genreFilter);
  const sorted = [...catalogFiltered].sort((a, b) => {
    if (state.sortBy === 'year') return b.year - a.year || a.title.localeCompare(b.title);
    if (state.sortBy === 'genre') return a.genreBucket.localeCompare(b.genreBucket) || a.title.localeCompare(b.title);
    return a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title);
  });

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
            {g === 'Всё' ? t('catalog.genreAll') : g}
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

          {filter !== 'albums' && <ConcertsFeed />}

          {filter !== 'artists' && (
            topRatedFiltered.length ? (
              <Shelf title={t('catalog.topRated')}>
                {topRatedFiltered.map((a, i) => (
                  <AlbumShelfCard
                    key={a.id}
                    cover={spotifyCovers[a.id] || a.cover}
                    title={a.title}
                    artist={a.artist}
                    artistId={a.artistId}
                    badge={`#${i + 1}`}
                    meta={`★ ${fmt1(albumRatings[a.id].avg)} · ${t('groups.ratingsN', { n: albumRatings[a.id].count })}`}
                    onClick={() => openAlbum(a.id)}
                  />
                ))}
              </Shelf>
            ) : (
              <section className="sh14">
                <div className="hd"><h2>{t('catalog.topRated')}</h2></div>
                <div className="tile t-soft2 empty"><MascotIcon /><p className="muted" style={{ fontWeight: 600 }}>{t('catalog.topRatedEmpty', { n: MIN_RATINGS_FOR_TOP })}</p></div>
              </section>
            )
          )}

          {filter !== 'artists' && (
            <section className="sh14">
              <div className="hd"><h2>{t('discover.reviewsWorthReading')}</h2></div>
              <SiteReviewsBlock />
            </section>
          )}

          {filter !== 'albums' && (
            <section className="sh14">
              <div className="hd"><h2>{t('catalog.genreTops')}</h2></div>
              <p className="muted sb">{regionLabel}</p>
              <GenreTopArtists onlyGenre={genreFilter} />
            </section>
          )}

          {filter !== 'albums' && (genreFilter === 'Всё' || genreFilter === 'Electronic') && (
            <section className="sh14">
              <div className="hd"><h2>{t('catalog.obscureArtists')}</h2></div>
              <p className="muted sb">Electronic · {t('discover.obscureSubtitle', { region: regionLabel })}</p>
              <ObscureAlbums genre="Electronic" />
            </section>
          )}

          {/* Full catalog as a table: eight rows, then "show all". */}
          {/* Full catalog as a table: eight rows, then "show all". */}
          {filter !== 'artists' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 34 }}>
                <h2 style={{ margin: 0 }}>{t('catalog.fullCatalog')} <span className="cnt">{sorted.length}</span></h2>
                <div className="chips" style={{ margin: 0 }} role="group" aria-label={t('catalog.sortAria')}>
                  {SORT_OPTIONS.map((s) => (
                    <button key={s.key} className={`chip ${state.sortBy === s.key ? 'on' : ''}`} onClick={() => setSortBy(s.key)}>{s.label}</button>
                  ))}
                </div>
              </div>
              <div className="tile cat10" style={{ marginTop: 14 }}>
                <div className="ch"><span /><span>{t('match.colAlbum')}</span><span>{t('catalog.colGenre')}</span><span>{t('catalog.colYear')}</span><span>{t('catalog.colScore')}</span><span>{t('catalog.colYou')}</span></div>
                {(catalogAll ? sorted : sorted.slice(0, 8)).map((a) => {
                  const mine = myRatings.find((r) => r.albumId === a.id)?.stars;
                  const score = albumRatings[a.id]?.avg;
                  return (
                    <button className="row" key={a.id} onClick={() => openAlbum(a.id)}>
                      <CoverArt url={spotifyCovers[a.id] || a.cover} fallbackLetter={a.artist[0] || '?'} className="cov" px={40} style={{ width: 40, height: 40 }} />
                      <span className="g"><b>{a.title}</b><small className="muted" style={{ fontWeight: 600 }}><ArtistName name={a.artist} id={a.artistId} size={16} /></small></span>
                      <span className="tag gn">{a.genreBucket}</span>
                      <span className="yy">{a.year}</span>
                      <b className="num sc">{score != null ? fmt1(score) : '–'}</b>
                      <span className="yu">{mine != null ? <span className="tag on9">{fmt1(mine)}</span> : <span className="muted">–</span>}</span>
                    </button>
                  );
                })}
              </div>
              {sorted.length > 8 && (
                <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => setCatalogAll((v) => !v)}>
                  {catalogAll ? t('catalog.showFewer') : t('catalog.showAll', { n: sorted.length })}
                </button>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
