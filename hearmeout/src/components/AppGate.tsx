'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { AppShell } from './AppShell';
import { RegisterModal } from './RegisterModal';
import { OnboardingScreen } from './OnboardingScreen';
import { LogoMark } from './ui/Icons';

// Music-themed instead of a bare "Loading…" — same spirit as a loading
// screen telling you it's "warming up" instead of just spinning. Picked
// randomly on the client after mount (not during render) so server and
// client agree on the first paint and React doesn't flag a hydration
// mismatch; phrases[0] is what SSR/first paint always shows.
const LOADING_PHRASES = [
  'Tuning up…',
  'Chasing the bassline…',
  'Reading your reviews…',
  'Untangling the headphones…',
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
          <LogoMark size={72} loading />
          <div className="logo" style={{ justifyContent: 'center' }}>Hear<span>Me</span>Out</div>
          <p>{loadingPhrase}</p>
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
