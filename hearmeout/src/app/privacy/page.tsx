import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { pickLanguage, translate, type TranslationKey } from '@/lib/i18n';

export const metadata: Metadata = { title: 'What we store — HearMeOut' };

const ITEM_KEYS: TranslationKey[] = ['privacy.item1', 'privacy.item2', 'privacy.item3', 'privacy.item4', 'privacy.item5'];

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
      <div className="wrap" style={{ maxWidth: 640, paddingTop: 48 }}>
        <a className="crumb" href="/">‹ {t('pub.back')}</a>
        <p className="eyebrow muted">{t('privacy.eyebrow')}</p>
        <h1 className="big" style={{ fontSize: 'clamp(28px,5vw,48px)' }}>{t('privacy.title')}</h1>
        <div className="bento">
          {ITEM_KEYS.map((key, i) => (
            <div className={`tile${i === 0 ? ' t-pop' : i === 3 ? ' t-soft2' : ''}`} key={key}><p style={{ fontWeight: 600 }}>{t(key)}</p></div>
          ))}
        </div>
      </div>
    </div>
  );
}
