'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- a full page load home is
   the point: it starts the app fresh after a crash. */
import { useEffect, useState } from 'react';
import { pickLanguage, translate, type Language, type TranslationKey } from '@/lib/i18n';
import { useLoadedLanguage } from '@/lib/useLoadedLanguage';
import { reportClientError } from '@/lib/reportClientError';

// A render error anywhere in the app: a friendly page in the site's style
// instead of a blank screen, and the error goes to app_errors. Outside the
// app's own state (that is what crashed), so the language comes from <html
// lang>, which the app keeps on the account's language.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [language, setLanguage] = useState<Language>('en');
  useEffect(() => {
    setLanguage(pickLanguage([document.documentElement.lang || navigator.language]));
    reportClientError(error.message || 'render error', error.stack || error.digest || null);
  }, [error]);
  const textLanguage = useLoadedLanguage(language);
  const t = (key: TranslationKey) => translate(textLanguage, key);
  return (
    <div className="rd">
      <div className="wrap" style={{ paddingTop: 48 }}>
        <div className="tile t-soft2 empty" role="alert">
          <h1 className="big" style={{ fontSize: 'clamp(34px,7vw,56px)' }}>{t('crash.title')}</h1>
          <p className="muted" style={{ fontWeight: 600 }}>{t('crash.body')}</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="btn" onClick={() => reset()}>{t('crash.retry')}</button>
            <a className="btn ghost" href="/">{t('crash.home')}</a>
          </div>
        </div>
      </div>
    </div>
  );
}
