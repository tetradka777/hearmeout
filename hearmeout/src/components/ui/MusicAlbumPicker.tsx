'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { CoverArt } from './CoverArt';

export function MusicAlbumPicker({ value, onChange, disabled = false }: { value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const { albums, liveAlbums, ensureLiveAlbum, t } = useApp();
  const selected = liveAlbums[value] || albums.find(a => a.id === value || a.spotifyId === value);
  // Existing choices already contain everything this picker displays. Only an
  // explicit deep link to an unknown Spotify album needs one detail request.
  useEffect(() => {
    if (value && !selected && /^[a-zA-Z0-9]{22}$/.test(value)) ensureLiveAlbum(value);
  }, [value, selected, ensureLiveAlbum]);
  const [query, setQuery] = useState('');
  const options = useMemo(() => {
    const all = [...new Map([...albums, ...Object.values(liveAlbums)].map(a => [a.id, a])).values()];
    const q = query.trim().toLocaleLowerCase();
    return all.filter(a => !q || `${a.title} ${a.artist}`.toLocaleLowerCase().includes(q)).slice(0, 12);
  }, [albums, liveAlbums, query]);
  return <div className="music36-picker">
    {selected && <div className="music36-selected"><CoverArt url={selected.cover} fallbackLetter={selected.title[0]} px={64} /><span><b>{selected.title}</b><small>{selected.artist}</small></span></div>}
    <label><span>{t('diary.chooseAlbum')}</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} disabled={disabled} placeholder={t('diary.searchAlbums')} /></label>
    <div className="music36-options" role="group" aria-label={t('diary.chooseAlbum')}>
      {options.map(a => <button type="button" key={a.id} disabled={disabled} aria-pressed={a.id === value} onClick={() => onChange(a.id)}><CoverArt url={a.cover} fallbackLetter={a.title[0]} px={44} /><span><b>{a.title}</b><small>{a.artist}</small></span><i className={`ic ${a.id === value ? 'ic-check' : 'ic-plus'}`} aria-hidden="true" /></button>)}
      {!options.length && <p className="muted">{t('diary.noAlbums')}</p>}
    </div>
  </div>;
}
