'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { searchLibrary, type LibraryArtist, type LibraryReleaseGroup } from '@/lib/musicbrainz';

export function LiveLibrarySearch({ query, onResult }: { query: string; onResult?: (hasResults: boolean) => void }) {
  const { t, openArtist, openAlbum, showToast } = useApp();
  const [result, setResult] = useState<{ artists: LibraryArtist[]; groups: LibraryReleaseGroup[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);

  const openGroup = async (title: string, artist: string, groupId: string) => {
    if (resolving) return;
    setResolving(groupId);
    try {
      const res = await fetch(`/api/spotify/resolve-album?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`);
      if (!res.ok) { showToast(t('toast.albumOpenFailed')); return; }
      const { id } = await res.json();
      openAlbum(id);
    } catch {
      showToast(t('toast.albumOpenFailed'));
    } finally {
      setResolving(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      searchLibrary(query)
        .then((r) => {
          if (cancelled) return;
          setResult(r);
          setLoading(false);
          onResult?.(r.artists.length > 0 || r.groups.length > 0);
        })
        .catch(() => {
          if (cancelled) return;
          const isFileProtocol = typeof location !== 'undefined' && location.protocol === 'file:';
          setError(isFileProtocol ? t('liveSearch.fileProtocolError') : t('liveSearch.error'));
          setLoading(false);
          onResult?.(false);
        });
    }, 450);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, t]);

  if (loading) return <p className="muted" style={{ fontWeight: 600 }}>{t('liveSearch.searching', { query })}</p>;
  if (error) return <p className="muted" style={{ fontWeight: 600 }}>{error}</p>;
  if (!result || (!result.artists.length && !result.groups.length)) {
    return <p className="muted" style={{ fontWeight: 600 }}>{t('liveSearch.empty')}</p>;
  }

  // discoverHtml() "From the open library": one soft tile of rows — letter dot,
  // name, "type · details" and an "open library" tag.
  return (
    <div className="tile t-soft2">
      {result.artists.map((ar) => (
        <button className="row" key={ar.id} onClick={() => openArtist(ar.id, ar.name)}>
          <span className="dot">{ar.name[0]}</span>
          <span className="g"><b>{ar.name}</b><small className="muted" style={{ fontWeight: 600 }}>{t('liveSearch.artistType')}{ar.type ? ` · ${ar.type}` : ''}</small></span>
          <span className="tag">{t('liveSearch.openLibraryTag')}</span>
        </button>
      ))}
      {result.groups.map((g) => {
        const artist = (g['artist-credit'] || []).map((c) => c.name).join(', ') || t('liveSearch.unknownArtist');
        const year = g['first-release-date'] ? g['first-release-date'].slice(0, 4) : '';
        return (
          <button className="row" key={g.id} onClick={() => openGroup(g.title, artist, g.id)} style={{ opacity: resolving === g.id ? 0.6 : 1 }}>
            <span className="dot">{g.title[0]}</span>
            <span className="g"><b>{g.title}</b><small className="muted" style={{ fontWeight: 600 }}>{t('liveSearch.albumType')} · {artist}{year ? ` · ${year}` : ''}</small></span>
            <span className="tag">{t('liveSearch.openLibraryTag')}</span>
          </button>
        );
      })}
    </div>
  );
}
