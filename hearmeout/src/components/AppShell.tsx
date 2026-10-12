'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { useApp } from '@/lib/AppContext';
import { useWheelRows } from '@/lib/hooks';
import type { Device, ScreenName } from '@/lib/types';
import { RedesignShell } from './redesign/Shell';
import { HomeScreen } from './screens/HomeScreen';
import { RateScreen } from './screens/RateScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { RecapScreen } from './screens/RecapScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { ArtistScreen } from './screens/ArtistScreen';
import { FriendScreen } from './screens/FriendScreen';
import { StatsScreen } from './screens/StatsScreen';
import { MatchScreen } from './screens/MatchScreen';
import { GroupsScreen } from './screens/GroupsScreen';
import { GroupScreen } from './screens/GroupScreen';
import { DiscoverScreen } from './screens/DiscoverScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { StatesScreen } from './screens/StatesScreen';
import { LaterScreen } from './screens/LaterScreen';
import { OnboardingScreen } from './OnboardingScreen';
import { preloadDetails } from '@/lib/backgroundPreload';
import { useScrollMemory } from '@/lib/scrollMemory';

// Every screen mounts the first time it's opened (or when the background
// preload gets to it) and stays mounted after
// (shown/hidden, not unmounted/remounted) so in-progress state — draft
// reviews, scroll position, form inputs — survives switching away and back.
const SCREENS: { name: ScreenName; Component: ComponentType<{ device: Device }> }[] = [
  { name: 'catalog', Component: HomeScreen },
  { name: 'rate', Component: RateScreen },
  { name: 'history', Component: HistoryScreen },
  { name: 'recap', Component: RecapScreen },
  { name: 'profile', Component: ProfileScreen },
  { name: 'artist', Component: ArtistScreen },
  { name: 'friend', Component: FriendScreen },
  { name: 'stats', Component: StatsScreen },
  { name: 'match', Component: MatchScreen },
  { name: 'groups', Component: GroupsScreen },
  { name: 'group', Component: GroupScreen },
  { name: 'discover', Component: DiscoverScreen },
  { name: 'settings', Component: SettingsScreen },
  { name: 'states', Component: StatesScreen },
  { name: 'later', Component: LaterScreen },
];

// Mounted in the background, one by one, once the first screen is up: each
// loads its data (and its covers) while hidden, so opening it later shows
// everything at once instead of starting the requests then.
const BACKGROUND_SCREENS: ScreenName[] = ['stats', 'match', 'groups', 'profile', 'recap', 'discover', 'history', 'later'];
const FIRST_DELAY_MS = 1200;
const STEP_MS = 700;

export function AppShell() {
  const { state, me } = useApp();
  useWheelRows();

  // A screen mounts the first time it's opened and then stays mounted
  // (hidden), so its state still survives switching away and back. Mounting
  // all fourteen at start-up made every one of them load its data at once
  // (dozens of requests) while only Home was on screen. Home is always
  // there: the activity strip reads the feed it loads.
  const [visited, setVisited] = useState<Set<ScreenName>>(() => new Set<ScreenName>(['catalog', state.activeScreen]));
  useEffect(() => {
    setVisited((v) => (v.has(state.activeScreen) ? v : new Set(v).add(state.activeScreen)));
  }, [state.activeScreen]);

  // Background preload: the main screens, then the friend and group pages
  // (lib/backgroundPreload). Starts once per account.
  const meId = me?.id ?? null;
  useEffect(() => {
    if (!meId || !me) return;
    let alive = true;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      if (!alive) return;
      const name = BACKGROUND_SCREENS[i++];
      if (!name) { preloadDetails(me, () => alive).catch(() => {}); return; }
      setVisited((v) => (v.has(name) ? v : new Set(v).add(name)));
      timer = setTimeout(step, STEP_MS);
    };
    timer = setTimeout(step, FIRST_DELAY_MS);
    return () => { alive = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId]);

  // Each page keeps its scroll position (lib/scrollMemory): switching
  // sections and coming back returns to the same place; a page not seen
  // before (another album, another friend) opens at the top. An in-screen
  // filter/setting change doesn't change the page, so it never scrolls.
  const pageKey = state.justRegistered ? 'onboarding'
    : state.activeScreen === 'rate' ? `rate:${state.currentAlbumId ?? ''}`
    : state.activeScreen === 'friend' ? `friend:${state.viewingUserId ?? ''}`
    : state.activeScreen === 'group' ? `group:${state.viewingGroupId ?? ''}`
    : state.activeScreen === 'artist' ? `artist:${state.currentArtist?.id ?? ''}`
    : state.activeScreen === 'recap' ? `recap:${state.recapViewUserId}`
    : state.activeScreen;
  useScrollMemory(pageKey);

  return (
    <RedesignShell>
      {/* Onboarding is a page in the main column (vOnboarding), shown in
          place of the active screen while the welcome tour is open. */}
      {state.justRegistered && <OnboardingScreen />}
      {SCREENS.map(({ name, Component }) => (
        <div key={name} style={state.activeScreen === name && !state.justRegistered ? undefined : { display: 'none' }}>
          {(visited.has(name) || state.activeScreen === name) && <Component device={state.view} />}
        </div>
      ))}
    </RedesignShell>
  );
}
