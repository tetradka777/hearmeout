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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(18,17,16,.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 1000 }}>
      <form
        onSubmit={handleSubmit}
        style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 28, maxWidth: 360, width: '100%' }}
      >
        <div className="eyebrow">{t('register.welcome')}</div>
        <h1 className="page-title" style={{ marginBottom: 14 }}>{mode === 'register' ? t('register.question') : t('login.title')}</h1>

        {mode === 'register' ? (
          <input
            className="name-input"
            style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', marginBottom: 10, fontSize: 16, width: '100%' }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('register.namePlaceholder')}
            autoFocus
          />
        ) : (
          <input
            className="name-input"
            style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', marginBottom: 10, fontSize: 16, width: '100%' }}
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder={t('login.handlePlaceholder')}
            autoFocus
          />
        )}
        <input
          type="password"
          className="name-input"
          style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', marginBottom: 14, fontSize: 16, width: '100%' }}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('register.passwordPlaceholder')}
        />

        {error && <div style={{ color: 'var(--coral)', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}

        <button className="btn-primary" style={{ width: '100%', marginBottom: 12 }} disabled={submitting}>
          {submitting
            ? (mode === 'register' ? t('register.submitting') : t('login.submitting'))
            : (mode === 'register' ? t('register.submit') : t('login.submit'))}
        </button>

        <button
          type="button"
          className="btn-ghost"
          style={{ width: '100%' }}
          onClick={() => { setMode((m) => (m === 'register' ? 'login' : 'register')); setError(null); }}
        >
          {mode === 'register' ? t('register.switchToLogin') : t('login.switchToRegister')}
        </button>
      </form>
    </div>
  );
}
