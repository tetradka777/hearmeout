'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { AppShell } from './AppShell';
import { RegisterModal } from './RegisterModal';
import { loadLanguage, pickLanguage, translate, type TranslationKey } from '@/lib/i18n';

// The prototype's JOKES (reference/app.js), localized. The splash shows
// before the account (and its language) is known, so the browser's
// language picks the dictionary. Picked on the client after mount, not
// during render, so server and client agree on the first paint (the
// first English phrase) and React doesn't flag a hydration mismatch.
const JOKE_KEYS: TranslationKey[] = ['splash.joke1', 'splash.joke2', 'splash.joke3', 'splash.joke4', 'splash.joke5', 'splash.joke6', 'splash.joke7'];

function useLoadingPhrase() {
  const [phrase, setPhrase] = useState(translate('en', JOKE_KEYS[0]));
  useEffect(() => {
    const lang = pickLanguage(navigator.languages);
    const key = JOKE_KEYS[Math.floor(Math.random() * JOKE_KEYS.length)];
    setPhrase(translate('en', key));
    void loadLanguage(lang).then(() => setPhrase(translate(lang, key)));
  }, []);
  return phrase;
}

const SPLASH_FADE_MS = 160;

// The splash covers actual authentication work only. A saved session can
// render immediately, so it must not wait for a minimum animation time.
function useSplashPhase(ready: boolean): 'on' | 'out' | 'gone' {
  const [phase, setPhase] = useState<'on' | 'out' | 'gone'>('on');
  useEffect(() => {
    if (!ready || phase !== 'on') return;
    const reduced = document.documentElement.dataset.motion === 'off' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => setPhase(reduced ? 'gone' : 'out'), 0);
    return () => clearTimeout(timer);
  }, [ready, phase]);
  useEffect(() => {
    if (phase !== 'out') return;
    const timer = setTimeout(() => setPhase('gone'), SPLASH_FADE_MS);
    return () => clearTimeout(timer);
  }, [phase]);
  return phase;
}

export function AppGate() {
  const { state } = useApp();
  const loadingPhrase = useLoadingPhrase();
  const splash = useSplashPhase(state.authStatus !== 'loading');

  let content = null;
  if (state.authStatus === 'anonymous') {
    content = <RegisterModal />;
  } else if (state.authStatus !== 'loading') {
    content = (
      <>
        <AppShell />
      </>
    );
  }

  return (
    <>
      {content}
      {splash !== 'gone' && (
        // A branded splash instead of a bare "Загрузка…" — this is also the
        // actual server-rendered HTML for the brief moment before auth
        // state resolves client-side, so it's what a slow connection or a
        // messenger link-preview crawler sees first, not empty text.
        <div className="rd" style={{ minHeight: 0 }}>
          <div className={`splash${splash === 'out' ? ' out' : ''}`} style={{ background: 'var(--bg)', transitionDuration: `${SPLASH_FADE_MS}ms` }} aria-hidden={splash === 'out'}>
            <span className="logo" style={{ justifyContent: 'center' }}><span className="mk" />hearmeout</span>
            <span className="eqs big"><i className="eq"><b /><b /><b /></i></span>
            <p className="muted" style={{ fontWeight: 700 }}>{loadingPhrase}</p>
          </div>
        </div>
      )}
    </>
  );
}
