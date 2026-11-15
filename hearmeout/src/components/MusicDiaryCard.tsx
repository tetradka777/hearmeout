'use client';

import { useApp } from '@/lib/AppContext';
import { useCachedJson } from '@/lib/cachedJson';
import { toLocale } from '@/lib/i18n';

export function MusicDiaryCard({ userId }: { userId?: string }) {
  const { me, t, language, openDiary } = useApp();
  const shared = !!userId && userId !== me?.id;
  const { data, failed, reload } = useCachedJson<{ total: number; lastDate: string | null }>(
    me && !shared ? '/api/diary?summary=1' : null,
  );
  if (!me) return null;
  return (
    <section className="tile t-paper diary36-card">
      <h3>{t('diary.title')}</h3>
      {!shared && (data?.total || failed) ? <p className="muted">{t(failed ? 'diary.loadFailed' : 'diary.count', { n: data?.total ?? 0 })}</p> : null}
      {!shared && data?.lastDate && <p className="muted">{t('diary.lastMemory', {
        date: new Date(`${data.lastDate}T12:00:00`).toLocaleDateString(toLocale(language), { day: 'numeric', month: 'short', year: 'numeric' }),
      })}</p>}
      <button className="btn" onClick={() => openDiary(undefined, shared ? userId : undefined)}>
        {t(shared ? 'diary.openShared' : data?.total ? 'diary.open' : 'diary.start')}
      </button>
      {failed && !shared && <button className="btn" onClick={() => void reload()}>{t('diary.retry')}</button>}
    </section>
  );
}
