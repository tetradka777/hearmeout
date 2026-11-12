'use client';

import { Suspense, useEffect, useState, type ComponentType } from 'react';
import dynamic from 'next/dynamic';
import { useApp } from '@/lib/AppContext';
import { useWheelRows } from '@/lib/hooks';
import type { Device, ScreenName } from '@/lib/types';
import { RedesignShell } from './redesign/Shell';
import { HomeScreen } from './screens/HomeScreen';
import { loadRateScreen, loadMatchScreen, loadGroupsScreen, loadDiscoverScreen, loadProfileScreen } from './screenModules';
const RateScreen = dynamic(loadRateScreen);
// The welcome tour is shown once per account: its own chunk too.
const OnboardingScreen = dynamic(() => import('./OnboardingScreen').then((m) => m.OnboardingScreen));
import { LaterReminderHost } from './LaterReminder';
import { markNav } from '@/lib/navQuiet';
import { useScrollMemory } from '@/lib/scrollMemory';
import { useSharedFeed } from '@/lib/useSharedFeed';

// Home is in the first bundle; every other screen is
// its own chunk, requested on first opening. Visited screens stay mounted
// so navigation back preserves their data without preloading private pages.
const loadHistoryScreen = () => import('./screens/HistoryScreen').then((m) => m.HistoryScreen);
const loadRecapScreen = () => import('./screens/RecapScreen').then((m) => m.RecapScreen);
const loadArtistScreen = () => import('./screens/ArtistScreen').then((m) => m.ArtistScreen);
const loadFriendScreen = () => import('./screens/FriendScreen').then((m) => m.FriendScreen);
const loadStatsScreen = () => import('./screens/StatsScreen').then((m) => m.StatsScreen);
const loadGroupScreen = () => import('./screens/GroupScreen').then((m) => m.GroupScreen);
const loadFanClubScreen = () => import('./screens/FanClubScreen').then((m) => m.FanClubScreen);
const loadSettingsScreen = () => import('./screens/SettingsScreen').then((m) => m.SettingsScreen);
const loadStatesScreen = () => import('./screens/StatesScreen').then((m) => m.StatesScreen);
const loadConcertsScreen = () => import('./screens/ConcertsScreen').then((m) => m.ConcertsScreen);
const loadLaterScreen = () => import('./screens/LaterScreen').then((m) => m.LaterScreen);
const loadDiaryScreen = () => import('./screens/DiaryScreen').then((m) => m.DiaryScreen);
const loadAlbumSwapScreen = () => import('./screens/AlbumSwapScreen').then((m) => m.AlbumSwapScreen);
const HistoryScreen = dynamic(loadHistoryScreen);
const RecapScreen = dynamic(loadRecapScreen);
const ProfileScreen = dynamic(loadProfileScreen);
const ArtistScreen = dynamic(loadArtistScreen);
const FriendScreen = dynamic(loadFriendScreen);
const StatsScreen = dynamic(loadStatsScreen);
const MatchScreen = dynamic(loadMatchScreen);
const GroupsScreen = dynamic(loadGroupsScreen);
const GroupScreen = dynamic(loadGroupScreen);
const FanClubScreen = dynamic(loadFanClubScreen);
const DiscoverScreen = dynamic(loadDiscoverScreen);
const SettingsScreen = dynamic(loadSettingsScreen);
const StatesScreen = dynamic(loadStatesScreen);
const LaterScreen = dynamic(loadLaterScreen);
const ConcertsScreen = dynamic(loadConcertsScreen);
const DiaryScreen = dynamic(loadDiaryScreen);
const AlbumSwapScreen = dynamic(loadAlbumSwapScreen);

// Every screen mounts the first time it is opened and stays mounted after
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
  { name: 'fanclub', Component: FanClubScreen },
  { name: 'concerts', Component: ConcertsScreen },
  { name: 'discover', Component: DiscoverScreen },
  { name: 'settings', Component: SettingsScreen },
  { name: 'states', Component: StatesScreen },
  { name: 'later', Component: LaterScreen },
  { name: 'diary', Component: DiaryScreen },
  { name: 'swap', Component: AlbumSwapScreen },
];

export function AppShell() {
  const { state, t } = useApp();
  useWheelRows();
  useSharedFeed();

  // A screen mounts the first time it's opened and then stays mounted
  // (hidden), so its state still survives switching away and back. Mounting
  // all fourteen at start-up made every one of them load its data at once
  // (dozens of requests) while only one screen was visible. The shared
  // feed above serves the activity strip without mounting a hidden Home.
  const [visited, setVisited] = useState<Set<ScreenName>>(() => new Set<ScreenName>([state.activeScreen]));
  useEffect(() => {
    markNav();
    setVisited((v) => (v.has(state.activeScreen) ? v : new Set(v).add(state.activeScreen)));
  }, [state.activeScreen]);

  // Each page keeps its scroll position (lib/scrollMemory): switching
  // sections and coming back returns to the same place; a page not seen
  // before (another album, another friend) opens at the top. An in-screen
  // filter/setting change doesn't change the page, so it never scrolls.
  const pageKey = state.justRegistered ? 'onboarding'
    : state.activeScreen === 'rate' ? `rate:${state.currentAlbumId ?? ''}`
    : state.activeScreen === 'friend' ? `friend:${state.viewingUserId ?? ''}`
    : state.activeScreen === 'diary' ? `diary:${state.diaryUserId}:${state.diaryAlbumId}`
    : state.activeScreen === 'swap' ? `swap:${state.swapFriendId}:${state.currentSwapId}`
    : state.activeScreen === 'group' ? `group:${state.viewingGroupId ?? ''}`
    : state.activeScreen === 'fanclub' ? `fanclub:${state.viewingFanClub?.id ?? ''}`
    : state.activeScreen === 'concerts' ? `concerts:${state.viewingConcerts?.name ?? ''}`
    : state.activeScreen === 'artist' ? `artist:${state.currentArtist?.id ?? ''}`
    : state.activeScreen === 'recap' ? `recap:${state.recapViewUserId}`
    : state.activeScreen;
  useScrollMemory(pageKey);

  return (
    <RedesignShell>
      {/* Onboarding is a page in the main column (vOnboarding), shown in
          place of the active screen while the welcome tour is open. */}
      {state.justRegistered && <OnboardingScreen />}
      <LaterReminderHost />
      {SCREENS.map(({ name, Component }) => (
        <div key={name} style={state.activeScreen === name && !state.justRegistered ? undefined : { display: 'none' }}>
          {/* Each screen waits for its code on its own: without a boundary a
              screen whose chunk hadn't arrived yet (opened, or mounted in the
              background) froze the whole app until it did. */}
          {(visited.has(name) || state.activeScreen === name) && (
            <Suspense fallback={<div className="scl22" role="status"><span className="spin" aria-hidden="true" /><span className="sr">{t('app.loading')}</span></div>}>
              <Component device={state.view} />
            </Suspense>
          )}
        </div>
      ))}
    </RedesignShell>
  );
}
