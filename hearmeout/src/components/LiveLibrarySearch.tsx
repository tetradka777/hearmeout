'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { searchLibrary, coverArtUrl, type LibraryArtist, type LibraryReleaseGroup } from '@/lib/musicbrainz';
import { CoverArt } from './ui/CoverArt';
import { ArtistAvatar } from './ui/ArtistAvatar';

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

  if (loading) return <p className="muted">{t('liveSearch.searching', { query })}</p>;
  if (error) return <p className="muted">{error}</p>;
  if (!result || (!result.artists.length && !result.groups.length)) {
    return <p className="muted">{t('liveSearch.empty')}</p>;
  }

  return (
    <>
      {result.artists.length > 0 && (
        <>
          <div className="setrow" style={{ border: 0, padding: 0, marginBottom: 10 }}><h3 style={{ marginBottom: 0 }}>{t('liveSearch.artists')}</h3></div>
          <div className="hrow">
            {result.artists.map((ar) => (
              <button className="cvw" key={ar.id} onClick={() => openArtist(ar.id, ar.name)} style={{ textAlign: 'left' }}>
                <ArtistAvatar name={ar.name} className="cov" />
                <div style={{ marginTop: 8 }}><b>{ar.name}</b><div className="muted">{ar.type || t('liveSearch.artistType')}</div></div>
              </button>
            ))}
          </div>
        </>
      )}
      {result.groups.length > 0 && (
        <>
          <div className="setrow" style={{ border: 0, padding: 0, marginBottom: 10 }}><h3 style={{ marginBottom: 0 }}>{t('liveSearch.albums')}</h3></div>
          <div className="fp">
            {result.groups.map((g) => {
              const artist = (g['artist-credit'] || []).map((c) => c.name).join(', ') || t('liveSearch.unknownArtist');
              const year = g['first-release-date'] ? g['first-release-date'].slice(0, 4) : '—';
              const cover = coverArtUrl(g.id);
              return (
                <button className="cvw" key={g.id} onClick={() => openGroup(g.title, artist, g.id)} style={{ textAlign: 'left', width: '100%', cursor: 'pointer', opacity: resolving === g.id ? 0.6 : 1 }}>
                  <CoverArt url={cover} fallbackLetter={artist[0] || '?'} className="cov" style={{ width: '100%', aspectRatio: '1' }} />
                  <div style={{ marginTop: 8 }}><b>{g.title}</b><div className="muted">{artist} · {year}</div></div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
