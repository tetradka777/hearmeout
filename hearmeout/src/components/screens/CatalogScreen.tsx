'use client';

import { useApp } from '@/lib/AppContext';
import type { Device } from '@/lib/types';
import { AlbumCard } from '../ui/AlbumCard';
import { PopularNowSection } from '../PopularNowSection';
import { ObscureAlbums } from '../ObscureAlbums';
import { GenreTopArtists } from '../GenreTopArtists';
import { LiveLibrarySearch } from '../LiveLibrarySearch';
import { FriendsRow } from '../FriendsRow';

const GENRES = ['Всё', 'Rock', 'Hip-Hop', 'Electronic', 'R&B', 'Pop', 'Latin'];

export function CatalogScreen({ device }: { device: Device }) {
  const { state, t, albums, albumRatings, setSearchQuery, setActiveGenre, setSortBy } = useApp();
  const gridClass = device === 'mobile' ? 'grid-cards' : 'd-grid';
  const rowClass = device === 'mobile' ? 'row-scroll' : 'd-grid';

  const SORT_OPTIONS: { key: 'year' | 'genre' | 'artist'; label: string }[] = [
    { key: 'year', label: t('catalog.sortYear') },
    { key: 'genre', label: t('catalog.sortGenre') },
    { key: 'artist', label: t('catalog.sortArtist') },
  ];

  const q = state.searchQuery.trim().toLowerCase();
  const genreFilter = state.activeGenre;
  const isFiltering = q.length > 0 || genreFilter !== 'Всё';

  const chips = (
    <div className="chips">
      {GENRES.map((g) => (
        <button key={g} className={`chip ${g === genreFilter ? 'on' : ''}`} onClick={() => setActiveGenre(g)}>
          {g === 'Всё' ? t('catalog.genreAll') : g}
        </button>
      ))}
    </div>
  );

  if (isFiltering) {
    const results = albums.filter((a) => {
      const matchesQ = !q || a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q);
      const matchesG = genreFilter === 'Всё' || a.genreBucket === genreFilter;
      return matchesQ && matchesG;
    });
    const showLive = q.length >= 2 && genreFilter === 'Всё';

    return (
      <>
        {device === 'mobile' && (
          <>
            <div className="eyebrow">{t('catalog.eyebrow')}</div>
            <h1 className="page-title">{t('catalog.title')}</h1>
            <div className="search-bar">
              <SearchIcon />
              <input type="text" placeholder={t('search.placeholder')} value={state.searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
          </>
        )}
        {chips}
        <div className="section-head"><h2>{t('catalog.inCatalog')}</h2><span>{results.length}</span></div>
        <div className={gridClass}>{results.map((a) => <AlbumCard key={a.id} album={a} />)}</div>
        {!results.length && (
          <div className="empty-state">
            {t('catalog.noResults')}
            <div style={{ marginTop: 10 }}>
              <button className="btn-ghost" onClick={() => { setSearchQuery(''); setActiveGenre('Всё'); }}>{t('catalog.resetFilters')}</button>
            </div>
          </div>
        )}
        {showLive && (
          <>
            <div className="section-head" style={{ marginTop: 22 }}><h2>{t('catalog.openLibrary')}</h2><span>MusicBrainz</span></div>
            <LiveLibrarySearch query={state.searchQuery.trim()} />
          </>
        )}
      </>
    );
  }

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
      {device === 'mobile' && (
        <>
          <div className="eyebrow">{t('catalog.eyebrow')}</div>
          <h1 className="page-title">{t('catalog.title')}</h1>
          <div className="search-bar">
            <SearchIcon />
            <input type="text" placeholder={t('search.placeholder')} value={state.searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        </>
      )}
      {chips}
      <FriendsRow />
      <div className="section-head"><h2>{t('catalog.popularNow')}</h2><span>{t('catalog.popularNowSubtitle')}</span></div>
      <PopularNowSection rowClass={rowClass} />

      {topRated.length > 0 && (
        <>
          <div className="section-head" style={{ marginTop: 26 }}><h2>{t('catalog.topRated')}</h2><span>{topRated.length}</span></div>
          <div className={rowClass}>{topRated.map((a) => <AlbumCard key={a.id} album={a} />)}</div>
        </>
      )}

      <div className="section-head" style={{ marginTop: 26 }}><h2><span className="unknown-badge">?</span>{t('catalog.obscureArtists')}</h2><span>{t('catalog.lowPopularity')}</span></div>
      <ObscureAlbums genre="Electronic" rowClass={rowClass} />

      <div className="section-head" style={{ marginTop: 26 }}><h2>{t('catalog.genreTops')}</h2><span>Spotify</span></div>
      <GenreTopArtists rowClass={rowClass} />

      <div className="section-head" style={{ marginTop: 26 }}><h2>{t('catalog.fullCatalog')}</h2><span>{albums.length}</span></div>
      <div className="chips">
        {SORT_OPTIONS.map((s) => (
          <button key={s.key} className={`chip ${state.sortBy === s.key ? 'on' : ''}`} onClick={() => setSortBy(s.key)}>
            {s.label}
          </button>
        ))}
      </div>
      <div className={gridClass}>{sorted.map((a) => <AlbumCard key={a.id} album={a} />)}</div>
    </>
  );
}

export function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--bg-legacy)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
