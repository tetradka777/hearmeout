'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { toLocale, regionDisplayName } from '@/lib/i18n';
import type { ConcertFeedItem } from '@/app/api/concerts/route';

// Discover → "Concerts": your most-listened artists first, then the most
// popular ones; your country's shows lead within each artist. Hidden when
// the server has no TICKETMASTER_API_KEY or nothing is announced.
export function ConcertsFeed() {
  const { t, language, me, openSpotifyArtist, showToast } = useApp();
  const [data, setData] = useState<{ configured: boolean; items: ConcertFeedItem[] } | null>(null);
  const region = me?.region ?? null;

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    fetch(`/api/concerts${region ? `?country=${encodeURIComponent(region)}` : ''}`)
      .then((r) => (r.ok ? r.json() : { configured: false, items: [] }))
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData({ configured: false, items: [] }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, region]);

  // Feed rows carry only the artist name; resolve the Spotify id on click,
  // same as the artist chips in Discover.
  const openByName = async (name: string) => {
    try {
      const res = await fetch(`/api/spotify/resolve-artist?name=${encodeURIComponent(name)}`);
      if (!res.ok) { showToast(t('toast.artistOpenFailed')); return; }
      openSpotifyArtist((await res.json()).id, name);
    } catch {
      showToast(t('toast.artistOpenFailed'));
    }
  };

  if (!data || !data.configured || !data.items.length) return null;
  const loc = toLocale(language);
  const groups: ['yours' | 'popular', string][] = [['yours', t('concerts.yours')], ['popular', t('concerts.popular')]];

  return (
    <>
      <h2 style={{ marginTop: 34 }}>{t('concerts.title')}</h2>
      <p className="muted" style={{ fontWeight: 600, margin: '-6px 0 12px' }}>
        {region ? t('concerts.subRegion', { region: regionDisplayName(region, language) }) : t('concerts.subWorld')}
      </p>
      {groups.map(([g, label]) => {
        const rows = data.items.filter((c) => c.group === g);
        if (!rows.length) return null;
        return (
          <div className={`tile${g === 'yours' ? ' t-soft2' : ''}`} key={g} style={{ marginBottom: 14 }}>
            <h3 style={{ marginBottom: 6 }}>{label}</h3>
            {rows.map((c) => {
              const d = new Date(`${c.date}T00:00:00Z`);
              const place = [c.venue, c.city, c.country && c.country !== region ? regionDisplayName(c.country, language) : null].filter(Boolean).join(' · ');
              return (
                <div className="row" key={`${c.artist}-${c.id}`}>
                  <span className="num" style={{ fontSize: 22, width: 72 }}>{d.toLocaleDateString(loc, { day: 'numeric', month: 'short', timeZone: 'UTC' })}</span>
                  <span className="g">
                    <button className="link" style={{ fontWeight: 800 }} onClick={() => openByName(c.artist)}>{c.artist}</button>
                    <small className="muted" style={{ fontWeight: 600 }}>{place}{c.time ? ` · ${c.time.slice(0, 5)}` : ''}</small>
                  </span>
                  {c.url && <a className="btn ghost" href={c.url} target="_blank" rel="noreferrer">{t('artist.tickets')}</a>}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
