'use client';

import { useApp } from '@/lib/AppContext';
import { useCachedJson } from '@/lib/cachedJson';
import { regionDisplayName, toLocale } from '@/lib/i18n';
import { useArtistPhoto } from '@/lib/artistPhotos';
import { sizedImage } from '@/lib/imageSize';
import type { Device } from '@/lib/types';
import type { ConcertFeedItem } from '@/app/api/concerts/route';
import { ArtistAvatar } from '../ui/ArtistName';

// One artist's upcoming shows (Discover → concerts → a card): the artist on
// a card over their blurred photo, then every date with its city and venue,
// each a link to its tickets. Read from the same concerts feed Discover
// shows, so it opens at once.
export function ConcertsScreen(_props: { device: Device }) {
  const { t, state, me, language, goBack, openSpotifyArtist } = useApp();
  const who = state.viewingConcerts;
  const region = me?.region ?? null;
  const feed = useCachedJson<{ configured: boolean; items: ConcertFeedItem[] }>(me && who ? `/api/concerts${region ? `?country=${encodeURIComponent(region)}` : ''}` : null);
  const photo = useArtistPhoto(who?.name ?? '', !!who, who?.id);
  if (!who) return null;
  const shows = (feed.data?.items || []).filter((c) => c.artist === who.name).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const id = who.id ?? shows[0]?.artistId ?? null;
  const loc = toLocale(language);
  const thisYear = new Date().getFullYear();
  const bg = photo ? sizedImage(photo, 300) ?? photo : null;

  return (
    <>
      <button className="crumb" onClick={() => goBack('discover')}>‹ {t('concerts.back')}</button>
      <div className="tile cnh19" style={bg ? { ['--cvbg' as string]: `url('${bg}')` } : undefined}>
        <ArtistAvatar name={who.name} id={id} photo={photo} size={112} />
        <div className="g">
          <p className="k">{t('concerts.title')}</p>
          <h1>{who.name}</h1>
          {feed.data && <p className="m">{shows.length ? t('concerts.datesN', { n: shows.length }) : t('artist.concertsNoneAnywhere')}</p>}
          {id && <button className="btn ghost" onClick={() => openSpotifyArtist(id, who.name)}>{t('fanclub.artistPage')}</button>}
        </div>
      </div>

      {!feed.data ? (
        <p className="muted" style={{ fontWeight: 600 }}>{feed.failed ? t('fanclub.loadError') : t('artist.concertsLoading')}</p>
      ) : shows.length > 0 && (
        <div className="cnl19">
          {shows.map((c) => {
            const d = new Date(`${c.date}T00:00:00Z`);
            const place = [c.city, c.country ? regionDisplayName(c.country, language) : null].filter(Boolean).join(', ') || c.name;
            const inner = (
              <>
                <span className="dt">
                  <b>{d.toLocaleDateString(loc, { day: 'numeric', timeZone: 'UTC' })}</b>
                  <small>{d.toLocaleDateString(loc, { month: 'short', timeZone: 'UTC' })}</small>
                </span>
                <span className="g">
                  <b>{place}</b>
                  <small>{[d.toLocaleDateString(loc, { weekday: 'long', timeZone: 'UTC' }), d.getUTCFullYear() !== thisYear ? String(d.getUTCFullYear()) : null, c.time ? c.time.slice(0, 5) : null].filter(Boolean).join(' · ')}</small>
                  {c.venue && <small className="vn">{c.venue}</small>}
                </span>
                {c.url && <span className="tk">{t('concerts.tickets')} →</span>}
              </>
            );
            return c.url
              ? <a className="cn" key={c.id} href={c.url} target="_blank" rel="noreferrer">{inner}</a>
              : <div className="cn" key={c.id}>{inner}</div>;
          })}
        </div>
      )}
    </>
  );
}
