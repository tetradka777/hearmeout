// Window events between screens, for "open X *with* Y" jumps that the
// target screen's own local state owns.

// detail: friend id — Match selects that friend (Home → "Compare with …",
// Taste match rows).
export const MATCH_FRIEND_EVENT = 'hmo:match-friend';
// detail: ProfileTab — Profile opens that tab (avatar menu → Friend requests).
export const PROFILE_TAB_EVENT = 'hmo:profile-tab';
// detail: settings section — Settings opens it (Home → import history).
export const SETTINGS_SECTION_EVENT = 'hmo:settings-section';

// Screens mount the first time they're opened (AppShell), and the jump
// fires its event right as it switches screens — before a screen opened for
// the first time is there to hear it. The last event of each kind is kept
// for a moment so that screen can pick it up when it mounts.
const PICKUP_MS = 2000;
const last = new Map<string, { detail: unknown; at: number }>();
if (typeof window !== 'undefined') {
  for (const type of [MATCH_FRIEND_EVENT, PROFILE_TAB_EVENT, SETTINGS_SECTION_EVENT]) {
    window.addEventListener(type, (e) => last.set(type, { detail: (e as CustomEvent).detail, at: Date.now() }));
  }
}

export function takeRecentEvent<T>(type: string): T | undefined {
  const v = last.get(type);
  last.delete(type);
  return v && Date.now() - v.at < PICKUP_MS ? (v.detail as T) : undefined;
}
