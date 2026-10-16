'use client';

import { useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { useCachedJson, invalidateJson, cachedPage } from '@/lib/cachedJson';
import { usePaged } from '@/lib/usePaged';
import type { FanClub } from '@/app/api/fanclubs/route';
import { ArtistShelfCard, Shelf } from './ui/SuperCards';

// Fan clubs are the artists you follow: on Groups as a grid of photo cards
// with how many people are in each, and on Discover as an endless shelf of
// clubs to join (artists you play a lot, then popular ones). A card opens
// the club's own page (FanClubScreen).
export function FanClubGrid() {
  const { t, openFanClub, showScreen } = useApp();
  const data = useCachedJson<{ mine: FanClub[] }>('/api/fanclubs').data;
  if (!data) return null;
  return (
    <section className="sh14">
      <div className="hd"><h2>{t('fandoms.title')}</h2><button className="link" onClick={() => showScreen('discover')}>{t('fandoms.find')} ›</button></div>
      {data.mine.length ? (
        <div className="fg14">
          {data.mine.map((f) => (
            <ArtistShelfCard key={f.name} name={f.name} id={f.id} sub={t('fandoms.members', { n: f.members })} onClick={() => f.id && openFanClub(f.id, f.name)} />
          ))}
        </div>
      ) : <div className="tile t-soft2"><p className="muted" style={{ fontWeight: 600 }}>{t('fandoms.empty')}</p></div>}
    </section>
  );
}

async function resolveId(name: string): Promise<string | null> {
  const res = await fetch(`/api/spotify/resolve-artist?name=${encodeURIComponent(name)}`).catch(() => null);
  if (!res?.ok) return null;
  return ((await res.json()) as { id?: string }).id ?? null;
}

export function FanClubsForYou() {
  const { t, showToast, openFanClub } = useApp();
  const { items, done, more } = usePaged<FanClub, number>(async (from) => {
    const d = await cachedPage<{ suggested: FanClub[]; next: number | null }>(`/api/fanclubs?suggest=${from ?? 0}`);
    return { items: d.suggested, next: d.next };
  }, (f) => f.name.toLowerCase(), [], 50);
  const [joined, setJoined] = useState<Set<string>>(new Set());
  if (!items.length) return null;
  // Opens the club's page (a chart artist's Spotify id is looked up first).
  const openClub = async (f: FanClub) => {
    const id = f.id ?? await resolveId(f.name);
    if (id) openFanClub(id, f.name); else showToast(t('toast.artistOpenFailed'));
  };
  const join = async (f: FanClub) => {
    setJoined((s) => new Set(s).add(f.name));
    // Chart artists come with a name only: find the Spotify artist first.
    const id = f.id ?? await resolveId(f.name);
    const res = id ? await fetch(`/api/artist/${id}/follow`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: f.name }) }).catch(() => null) : null;
    if (!res?.ok) {
      setJoined((s) => { const n = new Set(s); n.delete(f.name); return n; });
      showToast(t('artist.followFailed'));
      return;
    }
    showToast(t('artist.followedToast', { name: f.name }));
    invalidateJson('/api/fanclubs');
  };
  return (
    <Shelf title={t('fandoms.forYou')} onMore={more} done={done}>
      {items.map((f) => {
        const n = f.members + (joined.has(f.name) ? 1 : 0);
        return (
          <div className="cc14" key={f.name}>
            <ArtistShelfCard name={f.name} id={f.id} photo={f.photo} sub={n > 0 ? t('fandoms.members', { n }) : t('fandoms.beFirst')} onClick={() => openClub(f)} />
            <button className={`jn14${joined.has(f.name) ? ' on' : ''}`} onClick={() => !joined.has(f.name) && join(f)} disabled={joined.has(f.name)}>
              {joined.has(f.name) ? t('fandoms.joined') : t('fandoms.join')}
            </button>
          </div>
        );
      })}
    </Shelf>
  );
}
