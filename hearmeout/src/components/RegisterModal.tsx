'use client';

import { useState, type FormEvent } from 'react';
import { useApp } from '@/lib/AppContext';
import type { TranslationKey } from '@/lib/i18n';
import { DEMO_PROFILES } from '@/lib/demoAccounts';

const ERROR_KEY: Record<string, TranslationKey> = {
  weak_password: 'register.weakPassword',
  name_required: 'register.nameRequired',
  invalid_credentials: 'login.invalidCredentials',
  account_not_linked: 'login.accountNotLinked',
};

// Landing (signed out, spec "Landing", 13.1) — pixel-exact copy of the
// prototype's vLanding(): hero pill/title/body, the hero's own
// Create-an-account/Sign-in buttons (not the modal — the modal only
// appears once one of these is pressed, same as the prototype's
// openAuth()), the four feature tiles with their real tile styles
// (t-pop/t-soft2/plain/t-ac), and the three "see an example" links below.
// The example invite/profile links point at a real seeded demo account
// (demoAccounts.ts) instead of the prototype's fake example data.
function LandingBackground({ onAuth }: { onAuth: (mode: 'register' | 'login') => void }) {
  const { t } = useApp();
  const FEATURES: { title: string; bodyKey: TranslationKey; cls: string }[] = [
    { title: 'Rate', bodyKey: 'landing.featureRateBody', cls: 't-pop' },
    { title: 'Compare', bodyKey: 'landing.featureCompareBody', cls: 't-soft2' },
    { title: 'Track', bodyKey: 'landing.featureTrackBody', cls: '' },
    { title: 'Belong', bodyKey: 'landing.featureBelongBody', cls: 't-ac' },
  ];
  const demo = DEMO_PROFILES[0];
  return (
    <div className="wrap">
      <div className="tile t-ink hero glow" style={{ minHeight: 420 }}>
        <span className="pill">{t('landing.pill')}</span>
        <h1>{t('landing.heroTitle')}</h1>
        <p className="muted" style={{ fontWeight: 600, maxWidth: '46ch', marginBottom: 10 }}>{t('landing.heroBody')}</p>
        <div className="acts">
          <button className="btn lg" onClick={() => onAuth('register')}>{t('landing.createAccount')}</button>
          <button className="btn ghost lg" onClick={() => onAuth('login')}>{t('landing.signIn')}</button>
        </div>
      </div>
      <div className="bento b3" style={{ marginTop: 14 }}>
        {FEATURES.map((f) => (
          <div className={`tile ${f.cls}`.trim()} key={f.title}>
            <h3>{f.title}</h3>
            <p className="muted" style={{ fontWeight: 600, marginTop: 6 }}>{t(f.bodyKey)}</p>
          </div>
        ))}
      </div>
      <div className="acts">
        <a className="btn ghost" href={`/invite/${demo.id}`}>{t('landing.seeInviteExample')}</a>
        <a className="btn ghost" href={`/u/${demo.name}`}>{t('landing.seePublicExample')}</a>
        <a className="btn ghost" href="/privacy">{t('landing.whatWeStore')}</a>
      </div>
    </div>
  );
}

export function RegisterModal() {
  const { t, registerWithPassword, loginWithPassword } = useApp();
  const [authOpen, setAuthOpen] = useState<'register' | 'login' | null>(null);
  const mode = authOpen ?? 'register';
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function mapError(err: unknown, fallback: TranslationKey): string {
    const code = err instanceof Error ? err.message : '';
    return t(ERROR_KEY[code] || fallback);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === 'register' && !name.trim()) { setError(t('register.nameRequired')); return; }
    if (mode === 'login' && !handle.trim()) { setError(t('login.handleRequired')); return; }
    if (!password) { setError(t('register.passwordRequired')); return; }

    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'register') {
        await registerWithPassword(name.trim(), password);
      } else {
        await loginWithPassword(handle.trim(), password);
      }
    } catch (err) {
      setError(mapError(err, mode === 'register' ? 'register.failed' : 'login.failed'));
      setSubmitting(false);
    }
  }

  return (
    <div className="rd">
      <LandingBackground onAuth={(m) => { setAuthOpen(m); setError(null); }} />
      {authOpen && (
        <div className="modalbg">
          <form onSubmit={handleSubmit} className="tile modal" role="dialog" aria-modal="true" style={{ maxWidth: 360, width: '100%', padding: 28 }}>
            <h2 style={{ marginBottom: 6 }}>{mode === 'register' ? t('register.titleSignup') : t('login.title')}</h2>
            <p className="muted" style={{ fontWeight: 600, marginBottom: 14 }}>{mode === 'register' ? t('register.subtitleSignup') : t('login.subtitle')}</p>

            {mode === 'register' ? (
              <>
                <label htmlFor="au1">{t('register.nameLabel')}</label>
                <input id="au1" className="field" style={{ width: '100%', marginTop: 6, marginBottom: 10 }} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('register.namePlaceholder')} autoComplete="name" autoFocus />
              </>
            ) : (
              <>
                <label htmlFor="au1">{t('login.handleLabel')}</label>
                <input id="au1" className="field" style={{ width: '100%', marginTop: 6, marginBottom: 10 }} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder={t('login.handlePlaceholder')} autoComplete="username" autoFocus />
              </>
            )}
            <label htmlFor="au2" style={{ marginTop: 10 }}>{t('register.passwordLabel')}</label>
            <input id="au2" type="password" className="field" style={{ width: '100%', marginTop: 6, marginBottom: 14 }} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'register' ? t('register.passwordPlaceholder') : t('login.passwordPlaceholder')} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />

            {error && <p className="ferr" role="alert">{error}</p>}

            <div className="acts" style={{ marginTop: error ? 10 : 0 }}>
              <button className="btn lg" disabled={submitting}>
                {submitting
                  ? (mode === 'register' ? t('register.submitting') : t('login.submitting'))
                  : (mode === 'register' ? t('register.submit') : t('login.submit'))}
              </button>
            </div>

            <button type="button" className="link" style={{ marginTop: 14, display: 'inline-block' }} onClick={() => { setAuthOpen((m) => (m === 'register' ? 'login' : 'register')); setError(null); }}>
              {mode === 'register' ? t('register.switchToLogin') : t('login.switchToRegister')}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
