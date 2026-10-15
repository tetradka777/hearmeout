'use client';

import type { ReactNode } from 'react';
import { AmbientBackdrop } from '../ui/Backdrop';
import { useApp } from '@/lib/AppContext';
import { userAvatarStyle } from '@/lib/format';
import type { ScreenName } from '@/lib/types';
import type { TranslationKey } from '@/lib/i18n';
import { HomeIcon, PeopleIcon, CompassSearchIcon } from '../ui/Icons';
import { GroupsIcon } from './icons';
import { Ticker } from './Ticker';
import { TopButtons } from './TopButtons';
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
    { screen: 'groups', labelKey: 'nav.groups' },
    { screen: 'discover', labelKey: 'nav.discover' },
    // The tab bar has your photo for this; the top bar needs it written.
    { screen: 'profile', labelKey: 'nav.profile' },
  ];
}

// Which nav item lights up for a given screen — the prototype's NAVKEY:
// artist → Discover, friend → Match, group → Groups; Stats and Recap
// (opened from the profile) light up nothing;
// profile / settings / later / states light up nothing. History is
// special-cased below (Rate only when opened from Rate).
const NAV_GROUP: Record<ScreenName, ScreenName | null> = {
  catalog: 'catalog', artist: 'discover',
  history: null, rate: 'rate',
  match: 'match', friend: 'match',
  stats: null, recap: null,
  groups: 'groups',
  group: 'groups',
  fanclub: 'groups',
  discover: 'discover',
  profile: 'profile',
  settings: null,
  states: null,
  later: null,
};

// Statistics isn't in the menu: it opens from the profile.
const TAB_SCREENS: ScreenName[] = ['catalog', 'match', 'discover', 'groups'];
const TAB_LABEL: Partial<Record<ScreenName, TranslationKey>> = {
  catalog: 'nav.home', match: 'tab.match', discover: 'nav.find', groups: 'nav.groups',
};
const TAB_ICON: Partial<Record<ScreenName, ReactNode>> = {
  catalog: <HomeIcon />, match: <PeopleIcon />, discover: <CompassSearchIcon />, groups: <GroupsIcon />,
};

export function RedesignShell({ children }: { children: ReactNode }) {
  const { me, t, state, showScreen, setSearchQuery, openAlbum, friendRequests } = useApp();
  // "Rate" opens the album/rate screen for the album last looked at
  // (prototype: go('rate') with S.album), not the ratings history.
  const goToNavItem = (screen: ScreenName) => (screen === 'rate' ? openAlbum(state.currentAlbumId) : showScreen(screen));
  const navItems = useNavItems();
  // History lights up "Rate" only when it was opened from the Rate screen
  // (prototype: histFrom === 'rate').
  const activeGroup = state.activeScreen === 'history' ? (state.historyOrigin === 'rate' ? 'rate' : null) : NAV_GROUP[state.activeScreen];
  const { currentTrack, quiet } = usePlayer();
  const hasPlayer = !!currentTrack && !quiet;
  const hasNowPlaying = !!me?.nowPlaying;

  return (
    <div className={`rd${hasPlayer ? ' hasmp' : ''}${hasNowPlaying ? ' hasnp' : ''}`}>
      {/* Keyboard users skip the menus straight to the screen (shown on focus).
          A button, not an #main link: a hash change would add a history
          entry, and back/forward drive the screen here. */}
      <button className="skip" onClick={() => document.getElementById('main')?.focus()}>{t('nav.skipToContent')}</button>
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
          <TopButtons />
        </div>
      </div>

      {/* Mobile header (both designs) */}
      <header className="mobtop">
        <button className="logo" onClick={() => showScreen('catalog')}><span className="mk" />hearmeout</button>
        <div className="topr">
          <TopButtons />
        </div>
      </header>

      <AmbientBackdrop />
      <Ticker />

      <main className="fade" id="main" tabIndex={-1}>{children}</main>
      </div>

      {/* Mobile tab bar: 5 tabs and your profile photo */}
      <nav className="tabbar" aria-label={t('nav.main')}>
        {TAB_SCREENS.map((screen) => (
          <button key={screen} className={activeGroup === screen ? 'on' : ''} onClick={() => showScreen(screen)}>
            {TAB_ICON[screen]}
            <span>{t(TAB_LABEL[screen]!)}</span>
          </button>
        ))}
        {/* Your profile, as your photo, at the end of the bar. */}
        {me && (
          <button className={`tbp${state.activeScreen === 'profile' ? ' on' : ''}`} onClick={() => showScreen('profile')} aria-label={t('nav.profile')}>
            <span className="avt" style={{ ...userAvatarStyle(me), backgroundSize: 'cover' }}>{!me.avatarUrl && me.name[0]?.toUpperCase()}</span>
            {friendRequests.incoming.length > 0 && <span className="badge" aria-hidden="true">{friendRequests.incoming.length}</span>}
          </button>
        )}
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
