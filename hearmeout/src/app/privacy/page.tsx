/* eslint-disable @next/next/no-html-link-for-pages --
   This page lives outside AppProvider; links into the app ("/", "/?auth=…")
   must be full page loads so the app shell boots fresh (RegisterModal reads
   ?auth= at module load, before the first history entry rewrites "/"). */
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { pickLanguage, translate, type TranslationKey } from '@/lib/i18n';

export const metadata: Metadata = { title: 'What we store — HearMeOut' };

// vData(): four titled tiles (account, ratings, play history, people), then
// the longer notes on visibility, sources and deletion.
const TILES: [TranslationKey, TranslationKey, string][] = [
  ['privacy.accountTitle', 'privacy.accountBody', ''],
  ['privacy.ratingsTitle', 'privacy.ratingsBody', 't-pop'],
  ['privacy.historyTitle', 'privacy.historyBody', ''],
  ['privacy.peopleTitle', 'privacy.peopleBody', 't-soft2'],
];
const NOTE_KEYS: TranslationKey[] = ['privacy.item2', 'privacy.item3', 'privacy.item4', 'privacy.item5'];

// Plain server component, deliberately outside AppProvider/AppGate — same
// reasoning as /u/[handle]: a page a user might link to or read without
// being logged in, so it shouldn't depend on client-side auth state. The
// language comes from the browser's Accept-Language (vData() in the
// prototype: crumb, eyebrow, H1, tiles).
export default async function PrivacyPage() {
  const lang = pickLanguage((await headers()).get('accept-language'));
  const t = (key: TranslationKey) => translate(lang, key);
  return (
    <div className="rd">
      <div className="wrap" style={{ paddingTop: 48 }}>
        <a className="crumb" href="/">‹ {t('pub.back')}</a>
        <p className="eyebrow muted">{t('privacy.eyebrow')}</p>
        <h1 className="big">{t('privacy.title')}</h1>
        <div className="bento">
          {TILES.map(([title, body, cls]) => (
            <div className={cls ? `tile ${cls}` : 'tile'} key={title}>
              <h2>{t(title)}</h2>
              <p className={cls === 't-pop' ? undefined : 'muted'} style={{ fontWeight: 600 }}>{t(body)}</p>
            </div>
          ))}
        </div>
        {NOTE_KEYS.map((key) => <p className="muted" style={{ marginTop: 18, fontWeight: 600 }} key={key}>{t(key)}</p>)}
      </div>
    </div>
  );
}
