'use client';

import { useCachedJson } from '@/lib/cachedJson';
import { ArtistAvatar } from './ui/ArtistName';
import { DarkCard, Shelf } from './ui/SuperCards';
import { useArtistPhoto } from '@/lib/artistPhotos';
import { useApp } from '@/lib/AppContext';
import { toLocale, regionDisplayName } from '@/lib/i18n';
import type { Concert } from '@/lib/concerts';
import type { ConcertFeedItem } from '@/app/api/concerts/route';

// Discover → "Concerts": your most-listened artists first, then the most
// popular ones; your country's shows lead within each artist. Hidden when
// the server has no TICKETMASTER_API_KEY or nothing is announced.
export function ConcertsFeed() {
  const { t, me } = useApp();
  const region = me?.region ?? null;
  // Through the browser's shared cache: shown at once on a later visit.
  const data = useCachedJson<{ configured: boolean; items: ConcertFeedItem[] }>(me ? `/api/concerts${region ? `?country=${encodeURIComponent(region)}` : ''}` : null).data;

  if (!data || !data.configured || !data.items.length) return null;
  const groups: ['yours' | 'popular', string][] = [['yours', t('concerts.yours')], ['popular', t('concerts.popular')]];

  return (
    <>
      {groups.map(([g, label]) => {
        const rows = data.items.filter((c) => c.group === g);
        if (!rows.length) return null;
        return (
          <Shelf
            key={g}
            title={`${t('concerts.title')} · ${label}`}
          >
            {[...new Map(rows.map((c) => [c.artist, rows.filter((x) => x.artist === c.artist)])).entries()].map(([artist, shows]) => (
              <ConcertCard key={artist} artist={artist} id={shows[0].artistId} count={shows.length} next={[...shows].sort((a, b) => (a.date < b.date ? -1 : 1))[0]} />
            ))}
          </Shelf>
        );
      })}
    </>
  );
}

// One artist's shows as a card like Home's listening cards: how many shows
// big on the left ("5+" past five), the artist's photo round on the
// right and blurred behind, their name and the next show under both. Opens
// the artist's own concerts page.
function ConcertCard({ artist, id, count, next }: { artist: string; id: string | null; count: number; next: Concert }) {
  const { t, language, me, openConcerts } = useApp();
  const photo = useArtistPhoto(artist, true, id);
  const open = () => openConcerts(artist, id);
  const d = new Date(`${next.date}T00:00:00Z`);
  const place = [next.city, next.country && next.country !== me?.region ? regionDisplayName(next.country, language) : null].filter(Boolean).join(', ') || next.venue || '';
  return (
    <DarkCard
      cover={photo}
      className="rvc15 fdc15 cnc19"
      head={null}
      extra={<><button className="cna" onClick={open}>{artist}</button><p className="m15">{t('concerts.next')} {d.toLocaleDateString(toLocale(language), { day: 'numeric', month: 'short', timeZone: 'UTC' })}{place ? ` · ${place}` : ''}</p></>}
      onOpen={open}
      openText
      aside={<button className="cav" onClick={open} aria-label={artist} tabIndex={-1}><ArtistAvatar name={artist} id={id} photo={photo} size={132} /></button>}
    >
      <button className="cnn" onClick={open}>
        <b>{count > 5 ? '5+' : count}</b>
        <span>{t('concerts.showsWord', { n: count })}</span>
      </button>
    </DarkCard>
  );
}
