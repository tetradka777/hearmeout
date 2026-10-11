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

// Every screen mounts the first time it's opened and stays mounted after
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

export function AppShell() {
  const { state } = useApp();
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

  // Screen change scrolls to top; an in-screen filter/setting change (which
  // never changes activeScreen) keeps the scroll position (spec 5.3).
  useEffect(() => {
    if (state.navAction === 'push') window.scrollTo(0, 0);
  }, [state.activeScreen, state.navAction]);

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
