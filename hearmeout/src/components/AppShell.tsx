'use client';

import { Suspense, startTransition, useEffect, useState, type ComponentType } from 'react';
import dynamic from 'next/dynamic';
import { useApp } from '@/lib/AppContext';
import { useWheelRows } from '@/lib/hooks';
import type { Device, ScreenName } from '@/lib/types';
import { RedesignShell } from './redesign/Shell';
import { HomeScreen } from './screens/HomeScreen';
import { RateScreen } from './screens/RateScreen';
// The welcome tour is shown once per account: its own chunk too.
const OnboardingScreen = dynamic(() => import('./OnboardingScreen').then((m) => m.OnboardingScreen));
import { preloadDetails } from '@/lib/backgroundPreload';
import { markNav, whenQuiet } from '@/lib/navQuiet';
import { useScrollMemory } from '@/lib/scrollMemory';

// Home and the album page are in the first bundle; every other screen is
// its own chunk, fetched in the background right after start-up (they're
// mounted there a moment later anyway), so the first screen comes up
// without carrying all fourteen.
const loadHistoryScreen = () => import('./screens/HistoryScreen').then((m) => m.HistoryScreen);
const loadRecapScreen = () => import('./screens/RecapScreen').then((m) => m.RecapScreen);
const loadProfileScreen = () => import('./screens/ProfileScreen').then((m) => m.ProfileScreen);
const loadArtistScreen = () => import('./screens/ArtistScreen').then((m) => m.ArtistScreen);
const loadFriendScreen = () => import('./screens/FriendScreen').then((m) => m.FriendScreen);
const loadStatsScreen = () => import('./screens/StatsScreen').then((m) => m.StatsScreen);
const loadMatchScreen = () => import('./screens/MatchScreen').then((m) => m.MatchScreen);
const loadGroupsScreen = () => import('./screens/GroupsScreen').then((m) => m.GroupsScreen);
const loadGroupScreen = () => import('./screens/GroupScreen').then((m) => m.GroupScreen);
const loadFanClubScreen = () => import('./screens/FanClubScreen').then((m) => m.FanClubScreen);
const loadDiscoverScreen = () => import('./screens/DiscoverScreen').then((m) => m.DiscoverScreen);
const loadSettingsScreen = () => import('./screens/SettingsScreen').then((m) => m.SettingsScreen);
const loadStatesScreen = () => import('./screens/StatesScreen').then((m) => m.StatesScreen);
const loadConcertsScreen = () => import('./screens/ConcertsScreen').then((m) => m.ConcertsScreen);
const loadLaterScreen = () => import('./screens/LaterScreen').then((m) => m.LaterScreen);
const SCREEN_LOADERS = [loadConcertsScreen, loadHistoryScreen, loadRecapScreen, loadProfileScreen, loadArtistScreen, loadFriendScreen, loadStatsScreen, loadMatchScreen, loadGroupsScreen, loadGroupScreen, loadFanClubScreen, loadDiscoverScreen, loadSettingsScreen, loadStatesScreen, loadLaterScreen];
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
  { name: 'fanclub', Component: FanClubScreen },
  { name: 'concerts', Component: ConcertsScreen },
  { name: 'discover', Component: DiscoverScreen },
  { name: 'settings', Component: SettingsScreen },
  { name: 'states', Component: StatesScreen },
  { name: 'later', Component: LaterScreen },
];

// Mounted in the background, one by one, once the first screen is up: each
// loads its data (and its covers) while hidden, so opening it later shows
// everything at once instead of starting the requests then.
const BACKGROUND_SCREENS: ScreenName[] = ['stats', 'match', 'groups', 'profile', 'recap', 'discover', 'history', 'later'];
// Late enough that the first screen's own data and covers go first (on the
// small server every request of the background batch competes with them).
const FIRST_DELAY_MS = 2500;
const STEP_MS = 900;

export function AppShell() {
  const { state, me, t } = useApp();
  useWheelRows();

  // Fetch the other screens' code right after the first one is up (they're
  // small): waiting for an idle moment left a tab tapped in the first
  // seconds waiting too.
  useEffect(() => {
    const id = setTimeout(() => { for (const load of SCREEN_LOADERS) load().catch(() => {}); }, 0);
    return () => clearTimeout(id);
  }, []);

  // A screen mounts the first time it's opened and then stays mounted
  // (hidden), so its state still survives switching away and back. Mounting
  // all fourteen at start-up made every one of them load its data at once
  // (dozens of requests) while only Home was on screen. Home is always
  // there: the activity strip reads the feed it loads.
  const [visited, setVisited] = useState<Set<ScreenName>>(() => new Set<ScreenName>(['catalog', state.activeScreen]));
  useEffect(() => {
    markNav();
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
    const step = async () => {
      // A screen opened a moment ago goes first.
      await whenQuiet();
      if (!alive) return;
      const name = BACKGROUND_SCREENS[i++];
      if (!name) { preloadDetails(me, () => alive).catch(() => {}); return; }
      // A transition: a tap in the meantime is handled first, not after the
      // hidden screen's render.
      startTransition(() => setVisited((v) => (v.has(name) ? v : new Set(v).add(name))));
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
