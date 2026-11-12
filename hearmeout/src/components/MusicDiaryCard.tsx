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
      <span className="diary36-eyebrow">{t('diary.title')}</span>
      <h3>{t(shared ? 'diary.sharedTitle' : data?.total ? 'diary.cardTitle' : 'diary.firstTitle')}</h3>
      <p className="muted">
        {shared ? t('diary.sharedHint') : data ? data.total
          ? t('diary.count', { n: data.total })
          : t('diary.emptyHint') : t(failed ? 'diary.loadFailed' : 'diary.loading')}
      </p>
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
