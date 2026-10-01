// Extra line icons needed by the redesign shell that src/components/ui/Icons.tsx
// doesn't have yet (Groups, Settings, Sun/Moon for the quick mode toggle, the
// tab bar's + quick-rate button). Stroke-based (spec's nav icons are 22px
// line icons), unlike the filled icons in ui/Icons.tsx — kept separate so the
// old icon set is untouched.
import type { ReactNode } from 'react';

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

// Exact paths from reference/app.js's IC object.
export function GroupsIcon() {
  return (
    <Svg>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.5-4 3-6 6.5-6s6 2 6.5 6" />
      <circle cx="17.5" cy="9" r="2.5" />
    </Svg>
  );
}

export function SettingsIcon() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
    </Svg>
  );
}

// Exact paths from reference/app.js's SUNP/MOONP constants (the quick
// dark-mode toggle button).
export function SunIcon() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
    </Svg>
  );
}

export function MoonIcon() {
  return (
    <Svg>
      <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />
    </Svg>
  );
}

// The "retro computer" empty-state mascot (spec 3.13) — pixel-exact port
// of the prototype's MASCOT constant (reference/app.js): viewBox 0 0 96 88,
// a solid --ink body with a --pop screen, --ink eyes/smile and a --acc
// base, not a stroke-outlined approximation. Takes its colours from the
// current palette the same way the prototype's inline fill="var(--ink)"
// etc. do, so it re-colours with every palette/design/mode change.
export function MascotIcon() {
  return (
    <svg viewBox="0 0 96 88" width="96" height="88" aria-hidden="true">
      <rect x="10" y="4" width="76" height="60" rx="20" fill="var(--ink)" />
      <rect x="18" y="12" width="60" height="42" rx="13" fill="var(--pop)" />
      <circle cx="38" cy="30" r="4" fill="var(--ink)" />
      <circle cx="58" cy="30" r="4" fill="var(--ink)" />
      <path d="M38 40q10 8 20 0" stroke="var(--ink)" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <rect x="30" y="66" width="36" height="8" rx="4" fill="var(--ink)" />
      <rect x="20" y="76" width="56" height="9" rx="4.5" fill="var(--acc)" />
    </svg>
  );
}
