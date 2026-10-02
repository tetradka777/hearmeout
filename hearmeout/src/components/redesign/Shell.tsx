'use client';

import type { ReactNode } from 'react';
import { useApp } from '@/lib/AppContext';
import type { ScreenName } from '@/lib/types';
import type { TranslationKey } from '@/lib/i18n';
import { HomeIcon, StarIcon, PeopleIcon, BarsIcon, CompassSearchIcon, ProfileIcon } from '../ui/Icons';
import { userAvatarStyle } from '@/lib/format';
import { GroupsIcon, SettingsIcon } from './icons';
import { Ticker } from './Ticker';
import { AvatarMenu } from './AvatarMenu';
import { QuickModeToggle } from './QuickModeToggle';
import { GlobalPlayer } from '../DockedPlayer';
import { NowPlayingBar } from './NowPlayingBar';
import { usePlayer } from '@/lib/PlayerContext';

// The redesign's app shell (spec 3.9, 4, 15.1, 17.1): Cream Pop top pill
// bar OR Toxic sidebar (both rendered; CSS in components.css decides which
// shows, by data-design and viewport — same technique the prototype uses),
// mobile header, five-tab bar with a quick-rate +, the activity ticker, and
// the avatar menu. Mounted once around the existing screen-switching logic
// in AppShell.tsx, so none of this remounts when the active screen changes.

type NavItem = { screen: ScreenName; labelKey: TranslationKey; icon: ReactNode };

function useNavItems(): NavItem[] {
  return [
    { screen: 'catalog', labelKey: 'nav.home', icon: <HomeIcon /> },
    { screen: 'history', labelKey: 'nav.rate', icon: <StarIcon /> },
    { screen: 'match', labelKey: 'nav.match', icon: <PeopleIcon /> },
    { screen: 'stats', labelKey: 'nav.stats', icon: <BarsIcon /> },
    { screen: 'groups', labelKey: 'nav.groups', icon: <GroupsIcon /> },
    { screen: 'discover', labelKey: 'nav.discover', icon: <CompassSearchIcon /> },
  ];
}

// Which nav item lights up for a given screen — same grouping rule as the
// current site's TAB_GROUP (rate/artist/friend/recap/settings open "from
// content" and light up nothing, or the screen that leads to them).
const NAV_GROUP: Record<ScreenName, ScreenName | null> = {
  catalog: 'catalog', artist: 'discover',
  history: 'history', rate: null,
  match: 'match', friend: 'match',
  stats: 'stats', recap: null,
  groups: 'groups',
  group: 'groups',
  discover: 'discover',
  profile: null,
  settings: null,
  states: null,
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
  const navItems = useNavItems();
  const activeGroup = NAV_GROUP[state.activeScreen];
  const { currentTrack } = usePlayer();
  const hasPlayer = !!currentTrack;
  const hasNowPlaying = me?.design === 'toxic' && !!me?.nowPlaying;

  return (
    <div className={`rd${hasPlayer ? ' hasmp' : ''}${hasNowPlaying ? ' hasnp' : ''}`}>
      {/* Cream Pop desktop top bar */}
      <div className="nav">
        <div className="logo"><span className="mk" />hearmeout</div>
        <nav>
          {navItems.map((item) => (
            <button key={item.screen} className={activeGroup === item.screen ? 'on' : ''} onClick={() => showScreen(item.screen)}>
              {t(item.labelKey)}
            </button>
          ))}
        </nav>
        <div className="topr">
          <div style={{ position: 'relative' }}>
            <input
              className="search"
              placeholder={t('search.placeholder')}
              value={state.searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); showScreen('discover'); }}
            />
          </div>
          <QuickModeToggle />
          <AvatarMenu />
        </div>
      </div>

      {/* Toxic desktop sidebar */}
      <div className="side">
        <div className="logo"><span className="mk" />hearmeout</div>
        <nav>
          {navItems.map((item) => (
            <button key={item.screen} className={activeGroup === item.screen ? 'on' : ''} onClick={() => showScreen(item.screen)}>
              {item.icon}{t(item.labelKey)}
            </button>
          ))}
          <button className={state.activeScreen === 'settings' ? 'on' : ''} onClick={() => showScreen('settings')}>
            <SettingsIcon />{t('settings.menuSettings')}
          </button>
        </nav>
        <div className="merow">
          <QuickModeToggle />
          <button className="me" onClick={() => showScreen('profile')}>
            <span className="dot" style={me ? userAvatarStyle(me) : undefined}>
              {!me?.avatarUrl && <ProfileIcon />}
            </span>
            {me?.name}
          </button>
        </div>
      </div>

      {/* Mobile header (both designs) */}
      <div className="mobtop">
        <div className="logo"><span className="mk" />hearmeout</div>
        <div className="topr">
          <QuickModeToggle />
          <AvatarMenu />
        </div>
      </div>

      <Ticker />

      <main className="fade">{children}</main>

      {/* Mobile tab bar: 5 tabs + round quick-rate + (spec 3.9) */}
      <div className="tabbar">
        {TAB_SCREENS.map((screen) => (
          <button key={screen} className={activeGroup === screen ? 'on' : ''} onClick={() => showScreen(screen)}>
            {TAB_ICON[screen]}
            <span>{t(TAB_LABEL[screen]!)}</span>
          </button>
        ))}
        <button
          className="fab"
          onClick={() => {
            const playingId = me?.nowPlaying?.albumId || currentTrack?.albumId;
            if (playingId) openAlbum(playingId);
            else showScreen('history');
          }}
          aria-label={t('nav.rate')}
        >
          +
        </button>
      </div>

      {/* The preview mini-player takes priority over the now-playing bar
          while active (spec 13.17.2) — both live in the same fixed-bottom
          slot in Toxic, so only one renders at a time. */}
      {!hasPlayer && <NowPlayingBar />}
      <GlobalPlayer />
    </div>
  );
}
