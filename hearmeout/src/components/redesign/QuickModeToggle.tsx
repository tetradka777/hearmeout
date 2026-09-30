'use client';

import { useApp } from '@/lib/AppContext';
import { resolveMode } from '@/lib/palettes';
import { SunIcon, MoonIcon } from './icons';

// 40px round icon button (spec 3.9): moon in Light mode, sun in Dark mode.
// Flips Light/Dark of the current design and sets Mode explicitly (leaves
// System). Changing the design itself only happens in Settings/onboarding.
export function QuickModeToggle() {
  const { me, t, updateAppearance } = useApp();
  if (!me) return null;
  const effective = resolveMode(me.mode);
  return (
    <button
      className="ib"
      aria-label={t(effective === 'dark' ? 'settings.modeLight' : 'settings.modeDark')}
      onClick={() => updateAppearance({ mode: effective === 'dark' ? 'light' : 'dark' })}
    >
      {effective === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
