import type { ScreenName } from '@/lib/types';

// The same loaders serve navigation intent and the actual dynamic screen.
// Warming code never mounts a hidden page or requests its private/API data.
export const loadRateScreen = () => import('./screens/RateScreen').then(m => m.RateScreen);
export const loadMatchScreen = () => import('./screens/MatchScreen').then(m => m.MatchScreen);
export const loadGroupsScreen = () => import('./screens/GroupsScreen').then(m => m.GroupsScreen);
export const loadDiscoverScreen = () => import('./screens/DiscoverScreen').then(m => m.DiscoverScreen);
export const loadProfileScreen = () => import('./screens/ProfileScreen').then(m => m.ProfileScreen);

const loaders = { rate: loadRateScreen, match: loadMatchScreen, groups: loadGroupsScreen, discover: loadDiscoverScreen, profile: loadProfileScreen };
const warming = new Set<ScreenName>();

export function warmScreen(screen: ScreenName): void {
  if (!(screen in loaders) || warming.has(screen)) return;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (!navigator.onLine || connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '')) return;
  warming.add(screen);
  void loaders[screen as keyof typeof loaders]().catch(() => { warming.delete(screen); });
}
