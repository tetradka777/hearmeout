'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { AppShell } from './AppShell';
import { RegisterModal } from './RegisterModal';
import { OnboardingScreen } from './OnboardingScreen';

// Exact copy of the prototype's JOKES array (reference/app.js) — the
// prototype has no i18n at all, so this stays English-only like the rest
// of its one-off flavor text. Picked randomly on the client after mount
// (not during render) so server and client agree on the first paint and
// React doesn't flag a hydration mismatch; phrases[0] is what SSR/first
// paint always shows.
const LOADING_PHRASES = [
  'Untangling the headphone cables…',
  'Dusting off the vinyl…',
  'Asking your friends for hot takes…',
  'Convincing the algorithm you like jazz…',
  'Rewinding the cassette…',
  'Tuning the turntable…',
  'Counting how many times you replayed that one song…',
];

function useLoadingPhrase() {
  const [phrase, setPhrase] = useState(LOADING_PHRASES[0]);
  useEffect(() => {
    setPhrase(LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)]);
  }, []);
  return phrase;
}

export function AppGate() {
  const { state } = useApp();
  const loadingPhrase = useLoadingPhrase();
  if (state.authStatus === 'loading') {
    // A branded splash instead of a bare "Загрузка…" — this is also the
    // actual server-rendered HTML for the brief moment before auth state
    // resolves client-side, so it's what a slow connection or a messenger
    // link-preview crawler sees first, not empty text.
    return (
      <div className="rd">
        <div className="splash">
          <span className="logo" style={{ justifyContent: 'center' }}><span className="mk" />hearmeout</span>
          <span className="eqs big"><i className="eq"><b /><b /><b /></i></span>
          <p className="muted" style={{ fontWeight: 700 }}>{loadingPhrase}</p>
        </div>
      </div>
    );
  }
  if (state.authStatus === 'anonymous') {
    return <RegisterModal />;
  }
  return (
    <>
      <AppShell />
      {state.justRegistered && <OnboardingScreen />}
    </>
  );
}
