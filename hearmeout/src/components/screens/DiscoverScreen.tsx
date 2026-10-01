'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { Device } from '@/lib/types';
import { supabase } from '@/lib/supabaseClient';
import { userAvatarStyle, starsText, formatRelative } from '@/lib/format';
import { CoverArt } from '../ui/CoverArt';
import { AlbumCard } from '../ui/AlbumCard';
import { LiveLibrarySearch } from '../LiveLibrarySearch';
import { PopularNowSection } from '../PopularNowSection';
import { ObscureAlbums } from '../ObscureAlbums';
import { GenreTopArtists } from '../GenreTopArtists';
import { accentMix } from '@/lib/accentGradient';

// Discover: this is where the old Home/catalog-browser content lives now
// (redesign spec 13.3 — "Discover is where the old catalog lives"). Empty
// query shows the browse sections (genre chips, popular now, top rated,
// lesser-known artists, genre tops, full catalog+sort, reviews worth
// reading); a query shows album/artist/people/open-library results.

const GENRES = ['Всё', 'Rock', 'Hip-Hop', 'Electronic', 'R&B', 'Pop', 'Latin'];
type Filter = 'all' | 'albums' | 'artists' | 'people';

type PersonResult = { id: string; name: string; handle: string; avatarUrl: string | null };

function PersonRow({ person }: { person: PersonResult }) {
  const { t, me, friendRequests, addFriend, viewFriend } = useApp();
  if (!me) return null;
  const isMe = person.id === me.id;
  const isFriend = me.friends.some((f) => f.id === person.id);
  const isPending = friendRequests.outgoing.some((r) => r.user.id === person.id);
  return (
    <div className="row">
      <button className="rowlink" onClick={() => viewFriend(person.id)}>
        <div className="dot" style={userAvatarStyle(person)}>{person.name[0]}</div>
        <div className="g"><b>{person.name}</b><div className="muted">{person.handle}</div></div>
      </button>
      {isMe ? null : isFriend ? (
        <span className="tag">{t('friend.alreadyFriend')}</span>
      ) : isPending ? (
        <span className="tag">{t('friend.requestSent')}</span>
      ) : (
        <button className="btn" onClick={() => addFriend(person.handle)}>{t('friend.addThem')}</button>
      )}
    </div>
  );
}

type SiteReview = { stars: number; review: string; createdAt: string; albumId: string; user: { name: string; handle: string; avatarUrl: string | null } };

function SiteReviewsBlock() {
  const { t, language, albums, liveAlbums, openAlbum } = useApp();
  const [reviews, setReviews] = useState<SiteReview[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('ratings')
      .select('stars, review, created_at, album_id, users(name, handle, avatar_url)')
      .not('review', 'is', null)
      .eq('is_private', false)
      .order('created_at', { ascending: false })
      .limit(8)
      .then(({ data }) => {
        if (cancelled) return;
        type Row = { stars: number; review: string | null; created_at: string; album_id: string; users: { name: string; handle: string; avatar_url: string | null } | null };
        const rows = (data || []) as unknown as Row[];
        setReviews(rows.filter((r) => r.review).map((r) => ({
          stars: r.stars, review: r.review as string, createdAt: r.created_at, albumId: r.album_id,
          user: { name: r.users?.name ?? '', handle: r.users?.handle ?? '', avatarUrl: r.users?.avatar_url ?? null },
        })));
      });
    return () => { cancelled = true; };
  }, []);

  if (reviews === null) return <p className="muted">{t('reviews.loading')}</p>;
  const resolved = reviews
    .map((r) => ({ r, a: liveAlbums[r.albumId] || albums.find((x) => x.id === r.albumId) }))
    .filter((x): x is { r: SiteReview; a: NonNullable<typeof x.a> } => !!x.a)
    .slice(0, 5);
  if (!resolved.length) return <p className="muted">{t('reviews.empty')}</p>;

  return (
    <div className="stack">
      {resolved.map(({ r, a }, i) => (
        <div className="tile" key={i} onClick={() => openAlbum(a.id)} style={{ cursor: 'pointer' }}>
          <div className="setrow" style={{ border: 0, padding: 0, marginBottom: 8 }}>
            <div className="row" style={{ padding: 0 }}>
              <div className="dot" style={userAvatarStyle(r.user)}>{r.user.handle[1]?.toUpperCase()}</div>
              <b>{r.user.handle}</b>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: accentMix(r.stars / 5) }}>{starsText(r.stars)}</div>
              <small className="muted">{formatRelative(r.createdAt, language)}</small>
            </div>
          </div>
          <p style={{ marginBottom: 4 }}>{r.review}</p>
          <small className="muted">{a.title} — {a.artist}</small>
        </div>
      ))}
    </div>
  );
}

export function DiscoverScreen({ device }: { device: Device }) {
  const { t, me, state, albums, albumRatings, setSearchQuery, setActiveGenre, setSortBy } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const [people, setPeople] = useState<PersonResult[] | null>(null);
  const rowClass = device === 'mobile' ? 'hrow' : 'fp';
  const gridClass = 'fp';

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
    if (!showLive || filter === 'albums' || filter === 'artists') { setPeople(null); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/users/search?q=${encodeURIComponent(query.trim())}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => { if (!cancelled) setPeople(d); });
    }, 220);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, showLive, filter]);

  const albumResults = useMemo(() => {
    if (!q) return [];
    return albums.filter((a) => (a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)) && (genreFilter === 'Всё' || a.genreBucket === genreFilter));
  }, [albums, q, genreFilter]);

  if (!me) return null;

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: t('discover.filterAll') },
    { key: 'albums', label: t('discover.filterAlbums') },
    { key: 'artists', label: t('discover.filterArtists') },
    { key: 'people', label: t('discover.filterPeople') },
  ];

  const topRated = albums
    .filter((a) => albumRatings[a.id])
    .sort((a, b) => albumRatings[b.id].avg - albumRatings[a.id].avg)
    .slice(0, 3);
  const sorted = [...albums].sort((a, b) => {
    if (state.sortBy === 'year') return a.year - b.year;
    if (state.sortBy === 'genre') return a.genreBucket.localeCompare(b.genreBucket) || a.year - b.year;
    return a.artist.localeCompare(b.artist);
  });

  return (
    <>
      <div className="eyebrow">{t('discover.eyebrow')}</div>
      <h1 className="big">{t('discover.title')}</h1>
      <input className="field" type="search" style={{ maxWidth: 520, marginBottom: 16 }} placeholder={t('search.placeholder')} aria-label={t('search.placeholder')} value={query} onChange={(e) => setSearchQuery(e.target.value)} />
      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f.key} className={`chip ${filter === f.key ? 'on' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>

      {showLive ? (
        <>
          {filter !== 'people' && (
            <div className="chips">
              {GENRES.map((g) => (
                <button key={g} className={`chip ${g === genreFilter ? 'on' : ''}`} onClick={() => setActiveGenre(g)}>
                  {g === 'Всё' ? t('catalog.genreAll') : g}
                </button>
              ))}
            </div>
          )}
          {filter !== 'people' && albumResults.length > 0 && (
            <>
              <div className="setrow" style={{ border: 0, padding: 0, marginBottom: 10 }}><h3 style={{ marginBottom: 0 }}>{t('catalog.inCatalog')}</h3><small className="muted">{albumResults.length}</small></div>
              <div className={gridClass}>{albumResults.map((a) => <AlbumCard key={a.id} album={a} />)}</div>
            </>
          )}
          {filter === 'people' && (
            <>
              <div className="setrow" style={{ border: 0, padding: 0, marginTop: 22, marginBottom: 10 }}><h3 style={{ marginBottom: 0 }}>{t('discover.people')}</h3></div>
              {people === null ? <p className="muted">{t('discover.searching')}</p> :
                people.length ? <div className="stack">{people.map((p) => <PersonRow key={p.id} person={p} />)}</div> : <p className="muted">{t('discover.noPeople')}</p>}
            </>
          )}
          {filter !== 'people' && filter !== 'albums' && (
            <>
              <div className="setrow" style={{ border: 0, padding: 0, marginTop: 22, marginBottom: 10 }}><h3 style={{ marginBottom: 0 }}>{t('catalog.openLibrary')}</h3><small className="muted">MusicBrainz</small></div>
              <LiveLibrarySearch query={query.trim()} />
            </>
          )}
          {filter !== 'people' && !albumResults.length && (
            <div className="tile empty">
              <p>{t('catalog.noResults')}</p>
              <button className="btn ghost" onClick={() => { setSearchQuery(''); setActiveGenre('Всё'); }}>{t('catalog.resetFilters')}</button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="chips">
            {GENRES.map((g) => (
              <button key={g} className={`chip ${g === genreFilter ? 'on' : ''}`} onClick={() => setActiveGenre(g)}>
                {g === 'Всё' ? t('catalog.genreAll') : g}
              </button>
            ))}
          </div>

          <div className="setrow" style={{ border: 0, padding: 0, marginBottom: 10 }}><h3 style={{ marginBottom: 0 }}>{t('catalog.popularNow')}</h3><small className="muted">{t('catalog.popularNowSubtitle')}</small></div>
          <PopularNowSection rowClass={rowClass} />

          {topRated.length > 0 && (
            <>
              <div className="setrow" style={{ border: 0, padding: 0, marginTop: 26, marginBottom: 10 }}><h3 style={{ marginBottom: 0 }}>{t('catalog.topRated')}</h3><small className="muted">{topRated.length}</small></div>
              <div className={rowClass}>{topRated.map((a) => <AlbumCard key={a.id} album={a} />)}</div>
            </>
          )}

          <div className="setrow" style={{ border: 0, padding: 0, marginTop: 26, marginBottom: 10 }}><h3 style={{ marginBottom: 0 }}><span className="tag" style={{ marginRight: 6 }}>?</span>{t('catalog.obscureArtists')}</h3><small className="muted">{t('catalog.lowPopularity')}</small></div>
          <ObscureAlbums genre="Electronic" rowClass={rowClass} />

          <div className="setrow" style={{ border: 0, padding: 0, marginTop: 26, marginBottom: 10 }}><h3 style={{ marginBottom: 0 }}>{t('catalog.genreTops')}</h3><small className="muted">Spotify</small></div>
          <GenreTopArtists rowClass={rowClass} />

          <div className="setrow" style={{ border: 0, padding: 0, marginTop: 26, marginBottom: 10 }}><h3 style={{ marginBottom: 0 }}>{t('catalog.fullCatalog')}</h3><small className="muted">{albums.length}</small></div>
          <div className="chips">
            {SORT_OPTIONS.map((s) => (
              <button key={s.key} className={`chip ${state.sortBy === s.key ? 'on' : ''}`} onClick={() => setSortBy(s.key)}>{s.label}</button>
            ))}
          </div>
          <div className={gridClass}>{sorted.map((a) => <AlbumCard key={a.id} album={a} />)}</div>

          <div className="setrow" style={{ border: 0, padding: 0, marginTop: 26, marginBottom: 10 }}><h3 style={{ marginBottom: 0 }}>{t('discover.reviewsWorthReading')}</h3></div>
          <SiteReviewsBlock />
        </>
      )}
    </>
  );
}
