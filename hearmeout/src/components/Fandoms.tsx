'use client';

import { useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { useCachedJson } from '@/lib/cachedJson';
import type { Fandom } from '@/app/api/fandoms/route';
import { ArtistShelfCard, Shelf } from './ui/SuperCards';

type FandomsData = { mine: Fandom[]; suggested: Fandom[] };

// Fandoms (after Superfan) are the artists you follow: on Groups as a grid
// of photo cards with how many people are in each, and on Discover as
// "fandoms for you" (artists you play a lot) with a join button.
export function FandomGrid() {
  const { t, openSpotifyArtist, showScreen } = useApp();
  const data = useCachedJson<FandomsData>('/api/fandoms').data;
  if (!data) return null;
  return (
    <section className="sh14">
      <div className="hd"><h2>{t('fandoms.title')}</h2><button className="link" onClick={() => showScreen('discover')}>{t('fandoms.find')} ›</button></div>
      {data.mine.length ? (
        <div className="fg14">
          {data.mine.map((f) => (
            <ArtistShelfCard key={f.id} name={f.name} id={f.id} sub={t('fandoms.members', { n: f.members })} onClick={() => openSpotifyArtist(f.id, f.name)} />
          ))}
        </div>
      ) : <div className="tile t-soft2"><p className="muted" style={{ fontWeight: 600 }}>{t('fandoms.empty')}</p></div>}
    </section>
  );
}

export function FandomsForYou() {
  const { t, openSpotifyArtist, showToast } = useApp();
  const query = useCachedJson<FandomsData>('/api/fandoms');
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const list = query.data?.suggested ?? [];
  if (!list.length) return null;
  const join = async (f: Fandom) => {
    setJoined((s) => new Set(s).add(f.id));
    const res = await fetch(`/api/artist/${f.id}/follow`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: f.name }) }).catch(() => null);
    if (!res?.ok) {
      setJoined((s) => { const n = new Set(s); n.delete(f.id); return n; });
      showToast(t('artist.followFailed'));
      return;
    }
    showToast(t('artist.followedToast', { name: f.name }));
    query.reload();
  };
  return (
    <Shelf title={t('fandoms.forYou')}>
      {list.map((f) => (
        <div className="cc14" key={f.id}>
          <ArtistShelfCard name={f.name} id={f.id} sub={f.members + (joined.has(f.id) ? 1 : 0) > 0 ? t('fandoms.members', { n: f.members + (joined.has(f.id) ? 1 : 0) }) : t('fandoms.beFirst')} onClick={() => openSpotifyArtist(f.id, f.name)} />
          <button className={`jn14${joined.has(f.id) ? ' on' : ''}`} onClick={() => !joined.has(f.id) && join(f)} disabled={joined.has(f.id)}>
            {joined.has(f.id) ? t('fandoms.joined') : t('fandoms.join')}
          </button>
        </div>
      ))}
    </Shelf>
  );
}
