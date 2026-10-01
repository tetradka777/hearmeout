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

export function GroupsIcon() {
  return (
    <Svg>
      <circle cx="8" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M2.5 20c0-3.3 2.5-5.6 5.5-5.6S13.5 16.7 13.5 20" />
      <path d="M15 20c.2-2.5 1.7-4.3 3.8-5 2.1.6 3.7 2.5 3.7 5" />
    </Svg>
  );
}

export function SettingsIcon() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V19.6a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.55 13.5a1.7 1.7 0 0 0-1.56-1.04H2.9a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.5 7.4a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 6.93 2.6l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.04-1.56V1.3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 3.5a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.1a1.7 1.7 0 0 0 1.56 1.04h.14a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.56 1.05z" />
    </Svg>
  );
}

export function SunIcon() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.4M12 19.1v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" />
    </Svg>
  );
}

export function MoonIcon() {
  return (
    <Svg>
      <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z" />
    </Svg>
  );
}

export function PlusIcon() {
  return (
    <Svg>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

// The "retro computer" empty-state mascot (spec 3.13): a 96px SVG that
// takes its colours from the current palette, not a fixed illustration —
// --acct fills the screen, currentColor draws the body, so it re-colours
// automatically with every palette/design/mode change like everything else.
export function MascotIcon() {
  return (
    <svg viewBox="0 0 96 96" width="96" height="96" fill="none" aria-hidden="true">
      <rect x="14" y="14" width="68" height="48" rx="8" stroke="currentColor" strokeWidth="3" />
      <rect x="22" y="22" width="52" height="32" rx="3" fill="var(--acct)" opacity="0.85" />
      <circle cx="36" cy="38" r="3.2" fill="var(--bg)" />
      <circle cx="60" cy="38" r="3.2" fill="var(--bg)" />
      <path d="M38 46q10 7 20 0" stroke="var(--bg)" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <path d="M40 62l-4 14M56 62l4 14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M30 76h36" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
