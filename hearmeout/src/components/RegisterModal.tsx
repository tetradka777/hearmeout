'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useApp } from '@/lib/AppContext';
import type { TranslationKey } from '@/lib/i18n';
import { DEMO_PROFILES } from '@/lib/demoAccounts';
import { PENDING_INVITE_KEY, PENDING_INVITE_NAME_KEY } from '@/lib/pendingInvite';

const ERROR_KEY: Record<string, TranslationKey> = {
  weak_password: 'register.weakPassword',
  name_required: 'register.nameRequired',
  invalid_credentials: 'login.invalidCredentials',
  account_not_linked: 'login.accountNotLinked',
  server_config: 'auth.serverConfig',
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
        <a className="btn ghost" href={`/u/${demo.handle}`}>{t('landing.seePublicExample')}</a>
        <a className="btn ghost" href="/privacy">{t('landing.whatWeStore')}</a>
      </div>
    </div>
  );
}

// Read once at module load, before hydration: AppContext seeds the first
// history entry on mount and rewrites "/" without its query string, so by
// the time this component's effects run the ?auth= param is already gone.
const INITIAL_AUTH = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('auth') : null;

export function RegisterModal() {
  const { t, registerWithPassword, loginWithPassword } = useApp();
  const [authOpen, setAuthOpen] = useState<'register' | 'login' | null>(null);
  const mode = authOpen ?? 'register';
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  // Errors sit under their own field (prototype authHtml(): #e1 / #e2).
  const [error1, setError1] = useState('');
  const [error2, setError2] = useState('');
  const clearErrors = () => { setError1(''); setError2(''); };
  const [submitting, setSubmitting] = useState(false);
  const [pendingInviteName, setPendingInviteName] = useState<string | null>(null);

  // Arriving from an invite or public profile page's sign-up / sign-in
  // buttons (/?auth=register|login): open that modal straight away, and
  // say the friend request will follow (sent by AppContext after auth).
  useEffect(() => {
    if (INITIAL_AUTH === 'register' || INITIAL_AUTH === 'login') setAuthOpen(INITIAL_AUTH);
    try {
      if (localStorage.getItem(PENDING_INVITE_KEY)) setPendingInviteName(localStorage.getItem(PENDING_INVITE_NAME_KEY));
    } catch { /* storage unavailable */ }
  }, []);

  function mapError(err: unknown, fallback: TranslationKey): string {
    const code = err instanceof Error ? err.message : '';
    if (ERROR_KEY[code]) return t(ERROR_KEY[code]);
    return code && code !== 'signup_failed' && code !== 'login_failed' ? `${t(fallback)} (${code})` : t(fallback);
  }

  // Same checks and messages as the prototype's doAuth(): name 2–24,
  // password 8+, handle 3–20 of a-z 0-9 _. A wrong handle or password is
  // reported under the password field without saying which one was wrong.
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    clearErrors();
    let ok = true;
    if (mode === 'register') {
      const n = name.trim();
      if (n.length < 2 || n.length > 24) { setError1(t('register.nameLength')); ok = false; }
      if (password.length < 8) { setError2(t('register.weakPassword')); ok = false; }
    } else {
      const h = handle.trim().replace(/^@/, '').toLowerCase();
      if (!/^[a-z0-9_]{3,20}$/.test(h)) { setError1(t('login.handleFormat')); ok = false; }
      if (!password) { setError2(t('register.passwordRequired')); ok = false; }
    }
    if (!ok) return;

    setSubmitting(true);
    try {
      if (mode === 'register') {
        await registerWithPassword(name.trim(), password);
      } else {
        await loginWithPassword(handle.trim(), password);
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      const message = mapError(err, mode === 'register' ? 'register.failed' : 'login.failed');
      if (code === 'name_required') setError1(message);
      else setError2(message);
      setSubmitting(false);
    }
  }

  return (
    <div className="rd">
      <LandingBackground onAuth={(m) => { setAuthOpen(m); clearErrors(); }} />
      {authOpen && (
        <div className="modalbg">
          <form onSubmit={handleSubmit} className="modal tile" role="dialog" aria-modal="true" aria-labelledby="mt" noValidate>
            <h2 id="mt" style={{ marginBottom: 6 }}>{mode === 'register' ? t('register.titleSignup') : t('login.title')}</h2>
            <p className="muted" style={{ fontWeight: 600, marginBottom: 14 }}>{mode === 'register' ? t('register.subtitleSignup') : t('login.subtitle')}</p>
            {mode === 'register' ? (
              <>
                <label htmlFor="au1">{t('register.nameLabel')}</label>
                <input id="au1" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('register.namePlaceholder')} autoComplete="name" autoFocus aria-invalid={!!error1} aria-describedby="e1" />
              </>
            ) : (
              <>
                <label htmlFor="au1">{t('login.handleLabel')}</label>
                <input id="au1" className="field" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder={t('login.handlePlaceholder')} autoComplete="username" autoFocus aria-invalid={!!error1} aria-describedby="e1" />
              </>
            )}
            <p className="ferr" id="e1" role="alert">{error1}</p>
            <label htmlFor="au2" style={{ marginTop: 10 }}>{t('register.passwordLabel')}</label>
            <input id="au2" type="password" className="field" aria-invalid={!!error2} aria-describedby="e2" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'register' ? t('register.passwordPlaceholder') : t('login.passwordPlaceholder')} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />

            <p className="ferr" id="e2" role="alert">{error2}</p>
            {pendingInviteName && <p className="tag" style={{ marginTop: 10 }}>{t('register.pendingInviteNote', { name: pendingInviteName })}</p>}

            <div className="acts">
              <button className="btn lg" disabled={submitting}>
                {submitting
                  ? (mode === 'register' ? t('register.submitting') : t('login.submitting'))
                  : (mode === 'register' ? t('register.submit') : t('login.submit'))}
              </button>
            </div>

            <button type="button" className="link" style={{ marginTop: 14, display: 'inline-block' }} onClick={() => { setAuthOpen((m) => (m === 'register' ? 'login' : 'register')); clearErrors(); }}>
              {mode === 'register' ? t('register.switchToLogin') : t('login.switchToRegister')}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
