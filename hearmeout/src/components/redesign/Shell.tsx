'use client';

import type { ReactNode } from 'react';
import { useApp } from '@/lib/AppContext';
import type { ScreenName } from '@/lib/types';
import type { TranslationKey } from '@/lib/i18n';
import { HomeIcon, PeopleIcon, BarsIcon, CompassSearchIcon } from '../ui/Icons';
import { GroupsIcon } from './icons';
import { Ticker } from './Ticker';
import { AvatarMenu } from './AvatarMenu';
import { QuickModeToggle } from './QuickModeToggle';
import { GlobalPlayer } from '../DockedPlayer';
import { NowPlayingBar } from './NowPlayingBar';
import { usePlayer } from '@/lib/PlayerContext';
import { Toast } from '../ui/Toast';

// The redesign's app shell (spec 2.4, 3.9, 4, 15.1, 17.1): one top menu
// bar structure shared by both designs — they only ever differ in skin,
// never in what exists or where it sits (no sidebar in either design) —
// plus the mobile header, five-tab bar with a quick-rate +, the activity
// ticker, and the avatar menu. Mounted once around the existing
// screen-switching logic in AppShell.tsx, so none of this remounts when
// the active screen changes.

type NavItem = { screen: ScreenName; labelKey: TranslationKey };

function useNavItems(): NavItem[] {
  return [
    { screen: 'catalog', labelKey: 'nav.home' },
    { screen: 'rate', labelKey: 'nav.rate' },
    { screen: 'match', labelKey: 'nav.match' },
    { screen: 'stats', labelKey: 'nav.stats' },
    { screen: 'groups', labelKey: 'nav.groups' },
    { screen: 'discover', labelKey: 'nav.discover' },
  ];
}

// Which nav item lights up for a given screen — the prototype's NAVKEY:
// artist → Discover, friend → Match, group → Groups, recap → Stats;
// profile / settings / later / states light up nothing. History is
// special-cased below (Rate only when opened from Rate).
const NAV_GROUP: Record<ScreenName, ScreenName | null> = {
  catalog: 'catalog', artist: 'discover',
  history: null, rate: 'rate',
  match: 'match', friend: 'match',
  stats: 'stats', recap: 'stats',
  groups: 'groups',
  group: 'groups',
  discover: 'discover',
  profile: null,
  settings: null,
  states: null,
  later: null,
};

const TAB_SCREENS: ScreenName[] = ['catalog', 'match', 'discover', 'stats', 'groups'];
const TAB_LABEL: Partial<Record<ScreenName, TranslationKey>> = {
  catalog: 'nav.home', match: 'nav.match', discover: 'nav.find', stats: 'nav.stats', groups: 'nav.groups',
};
const TAB_ICON: Partial<Record<ScreenName, ReactNode>> = {
  catalog: <HomeIcon />, match: <PeopleIcon />, discover: <CompassSearchIcon />, stats: <BarsIcon />, groups: <GroupsIcon />,
};

export function RedesignShell({ children }: { children: ReactNode }) {
  const { me, t, state, showScreen, setSearchQuery, openAlbum } = useApp();
  // "Rate" opens the album/rate screen for the album last looked at
  // (prototype: go('rate') with S.album), not the ratings history.
  const goToNavItem = (screen: ScreenName) => (screen === 'rate' ? openAlbum(state.currentAlbumId) : showScreen(screen));
  const navItems = useNavItems();
  // History lights up "Rate" only when it was opened from the Rate screen
  // (prototype: histFrom === 'rate').
  const activeGroup = state.activeScreen === 'history' ? (state.historyOrigin === 'rate' ? 'rate' : null) : NAV_GROUP[state.activeScreen];
  const { currentTrack } = usePlayer();
  const hasPlayer = !!currentTrack;
  const hasNowPlaying = !!me?.nowPlaying;

  return (
    <div className={`rd${hasPlayer ? ' hasmp' : ''}${hasNowPlaying ? ' hasnp' : ''}`}>
      <div className="wrap">
      {/* Desktop top bar — identical structure in both designs (spec 2.4/15.1), skin only differs via CSS */}
      <div className="nav">
        <button className="logo" onClick={() => showScreen('catalog')}><span className="mk" />hearmeout</button>
        <nav aria-label={t('nav.main')}>
          {navItems.map((item) => (
            <button key={item.screen} className={activeGroup === item.screen ? 'on' : ''} onClick={() => goToNavItem(item.screen)}>
              {t(item.labelKey)}
            </button>
          ))}
        </nav>
        {/* Prototype: the search sits between the menu and .topr, and Enter
            (not every keystroke) opens Discover with the query. */}
        <input
          className="search"
          placeholder={t('search.placeholder')}
          aria-label={t('discover.searchAria')}
          value={state.searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') showScreen('discover'); }}
        />
        <div className="topr">
          <QuickModeToggle />
          <AvatarMenu />
        </div>
      </div>

      {/* Mobile header (both designs) */}
      <header className="mobtop">
        <button className="logo" onClick={() => showScreen('catalog')}><span className="mk" />hearmeout</button>
        <div className="topr">
          <QuickModeToggle />
          <AvatarMenu />
        </div>
      </header>

      <Ticker />

      <main className="fade">{children}</main>
      </div>

      {/* Mobile tab bar: 5 tabs + round quick-rate + (spec 3.9) */}
      <nav className="tabbar" aria-label={t('nav.main')}>
        {TAB_SCREENS.map((screen) => (
          <button key={screen} className={activeGroup === screen ? 'on' : ''} onClick={() => showScreen(screen)}>
            {TAB_ICON[screen]}
            <span>{t(TAB_LABEL[screen]!)}</span>
          </button>
        ))}
        {/* Quick rate: the playing album, else the album last looked at
            (prototype: data-go="rate" data-a=S.playing). */}
        <button
          className="fab"
          onClick={() => openAlbum(me?.nowPlaying?.albumId || currentTrack?.albumId || state.currentAlbumId)}
          aria-label={t('nav.quickRate')}
        >
          +
        </button>
      </nav>

      {/* The preview mini-player takes priority over the now-playing bar
          while active (spec 13.17.2) — both live in the same fixed-bottom
          slot, so only one renders at a time. */}
      {!hasPlayer && <NowPlayingBar />}
      <GlobalPlayer />
      <Toast />
    </div>
  );
}
