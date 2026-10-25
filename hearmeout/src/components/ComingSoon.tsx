'use client';

import { useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { useCachedJson } from '@/lib/cachedJson';
import { toLocale } from '@/lib/i18n';
import type { UpcomingRelease } from '@/lib/releaseCalendar';
import { CoverWall } from './ui/Visual';

// Discover → "coming soon": announced releases of your fan clubs' artists,
// soonest first, the date on each cover and a bell to be reminded on the
// day. Hidden when nothing is announced.
export function ComingSoon() {
  const { t, language, openAlbum, showToast } = useApp();
  const { data, reload } = useCachedJson<UpcomingRelease[]>('/api/fanclubs/upcoming');
  const [busy, setBusy] = useState<string | null>(null);
  if (!data?.length) return null;
  const loc = toLocale(language);
  const toggle = async (r: UpcomingRelease) => {
    setBusy(r.albumId);
    const res = r.reminded
      ? await fetch(`/api/reminders?albumId=${encodeURIComponent(r.albumId)}`, { method: 'DELETE' }).catch(() => null)
      : await fetch('/api/reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ albumId: r.albumId, title: r.title, artist: r.artist, date: r.date, cover: r.cover }) }).catch(() => null);
    setBusy(null);
    if (!res?.ok) { showToast(t('soon.failed')); return; }
    if (!r.reminded) showToast(t('soon.remindToast', { title: r.title }));
    await reload();
  };
  return (
    <section className="sh14 cs19">
      <div className="hd"><h2>{t('soon.title')}</h2></div>
      <CoverWall row items={data.map((r) => ({
        key: r.albumId,
        cover: r.cover,
        title: r.title,
        artist: r.artist,
        artistId: r.artistId,
        badge: new Date(`${r.date}T00:00:00Z`).toLocaleDateString(loc, { day: 'numeric', month: 'short', timeZone: 'UTC' }),
        onClick: r.albumId.startsWith('dz:') ? undefined : () => openAlbum(r.albumId),
        corner: (
          <button className={`ib bell19${r.reminded ? ' on' : ''}`} disabled={busy === r.albumId} aria-pressed={r.reminded} aria-label={r.reminded ? t('soon.remindOff') : t('soon.remindOn')} onClick={() => toggle(r)}>
            <i className="ic ic-cal" aria-hidden="true" />
          </button>
        ),
        sub: r.reminded ? t('soon.reminded') : undefined,
      }))} />
    </section>
  );
}
