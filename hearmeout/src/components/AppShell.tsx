'use client';

import { useEffect, type ComponentType } from 'react';
import { useApp } from '@/lib/AppContext';
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

// Every screen mounts once and stays mounted (shown/hidden, not
// unmounted/remounted) so in-progress state — draft reviews, scroll
// position, form inputs — survives switching away and back.
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
];

export function AppShell() {
  const { state } = useApp();

  // Screen change scrolls to top; an in-screen filter/setting change (which
  // never changes activeScreen) keeps the scroll position (spec 5.3).
  useEffect(() => {
    if (state.navAction === 'push') window.scrollTo(0, 0);
  }, [state.activeScreen, state.navAction]);

  return (
    <RedesignShell>
      {SCREENS.map(({ name, Component }) => (
        <div key={name} style={state.activeScreen === name ? undefined : { display: 'none' }}>
          <Component device={state.view} />
        </div>
      ))}
    </RedesignShell>
  );
}
