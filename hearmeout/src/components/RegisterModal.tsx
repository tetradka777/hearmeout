'use client';

import { useState, type FormEvent } from 'react';
import { useApp } from '@/lib/AppContext';
import type { TranslationKey } from '@/lib/i18n';

const ERROR_KEY: Record<string, TranslationKey> = {
  weak_password: 'register.weakPassword',
  name_required: 'register.nameRequired',
  invalid_credentials: 'login.invalidCredentials',
  account_not_linked: 'login.accountNotLinked',
};

// Landing (signed out) + sign-in modal (spec: "Landing", 13.1). The hero
// and four feature tiles are the marketing page behind the modal; the
// modal itself (register/login) is the carried-over function.
function LandingBackground() {
  const { t } = useApp();
  const FEATURES: { title: string; body: string }[] = [
    { title: 'Rate', body: 'Five stars with tenths, tags, an optional review.' },
    { title: 'Compare', body: 'Artist overlap, shared blend, weekly leaderboard.' },
    { title: 'Track', body: 'Play history, stats, an automatic weekly recap.' },
    { title: 'Belong', body: 'Small private groups with monthly awards and votes.' },
  ];
  return (
    <div className="wrap">
      <div className="tile t-ink hero">
        <span className="pill">{t('register.welcome')}</span>
        <h1>HearMeOut</h1>
        <p className="muted">Rate albums, compare music taste with friends, and find what to listen to next.</p>
      </div>
      <div className="bento b3" style={{ marginTop: 14 }}>
        {FEATURES.map((f) => (
          <div className="tile" key={f.title}>
            <h3>{f.title}</h3>
            <p className="muted">{f.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RegisterModal() {
  const { t, registerWithPassword, loginWithPassword } = useApp();
  const [mode, setMode] = useState<'register' | 'login'>('register');
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
      <LandingBackground />
      <div className="modalbg">
        <form onSubmit={handleSubmit} className="tile modal" style={{ maxWidth: 360, width: '100%', padding: 28 }}>
          <div className="eyebrow">{t('register.welcome')}</div>
          <h2 style={{ marginBottom: 14 }}>{mode === 'register' ? t('register.question') : t('login.title')}</h2>

          {mode === 'register' ? (
            <input className="field" style={{ width: '100%', marginBottom: 10 }} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('register.namePlaceholder')} autoFocus />
          ) : (
            <input className="field" style={{ width: '100%', marginBottom: 10 }} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder={t('login.handlePlaceholder')} autoFocus />
          )}
          <input type="password" className="field" style={{ width: '100%', marginBottom: 14 }} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('register.passwordPlaceholder')} />

          {error && <div className="ferr">{error}</div>}

          <button className="btn lg" style={{ width: '100%', marginBottom: 12, marginTop: error ? 10 : 0 }} disabled={submitting}>
            {submitting
              ? (mode === 'register' ? t('register.submitting') : t('login.submitting'))
              : (mode === 'register' ? t('register.submit') : t('login.submit'))}
          </button>

          <button type="button" className="btn ghost" style={{ width: '100%' }} onClick={() => { setMode((m) => (m === 'register' ? 'login' : 'register')); setError(null); }}>
            {mode === 'register' ? t('register.switchToLogin') : t('login.switchToRegister')}
          </button>
        </form>
      </div>
    </div>
  );
}
