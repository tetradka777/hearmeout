// Stroke-based line icons, pixel-exact ports of the prototype's IC object
// (reference/app.js) and its tabbar svg rule (fill:none; stroke:currentColor;
// stroke-width:2; stroke-linecap/linejoin:round) — not filled glyphs.

export function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11 12 3l9 8v10h-6v-6H9v6H3z" />
    </svg>
  );
}

export function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="12" r="6" />
      <circle cx="15" cy="12" r="6" />
    </svg>
  );
}

export function BarsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 20V10M12 20V4M19 20v-7" />
    </svg>
  );
}

// Exact path from reference/app.js loveBtn()/heartIb() — no fill/stroke
// attributes here on purpose: components.css's .love svg / .love.on svg
// rules do all of that from the parent button's "on" class, same as the
// prototype's own bare <svg aria-hidden="true"> with no inline styling.
export function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21s-7.5-4.6-9.5-9.2C1 8.1 3.3 5 6.5 5c2 0 3.5 1 5.5 3 2-2 3.5-3 5.5-3 3.2 0 5.5 3.1 4 6.8C19.5 16.4 12 21 12 21z" />
    </svg>
  );
}

export function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3h10a1 1 0 0 1 1 1v17l-6-4-6 4V4a1 1 0 0 1 1-1z" />
    </svg>
  );
}

export function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

export function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 5l9 7-9 7zM19 5v14" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function CompassSearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

export function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12,3 14.9,9.3 21.8,10 16.6,14.6 18.2,21.4 12,17.8 5.8,21.4 7.4,14.6 2.2,10 9.1,9.3" />
    </svg>
  );
}

// Exact path from reference/app.js (used by the docked preview player).
export function PlayIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8z" />
    </svg>
  );
}

// Spotify's mark (green disc, black waves) — the link to an album there.
export function SpotifyLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#1ED760" />
      <path fill="#000" d="M17.2 16.6a.75.75 0 0 1-1.03.25c-2.82-1.72-6.37-2.11-10.55-1.16a.75.75 0 1 1-.33-1.46c4.57-1.04 8.49-.59 11.66 1.34.35.22.46.68.25 1.03Zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.23-1.98-8.15-2.56-11.97-1.4a.94.94 0 1 1-.54-1.8c4.36-1.32 9.78-.68 13.49 1.6.44.27.58.85.31 1.29Zm.13-3.4C14.93 7.63 8.55 7.42 4.86 8.54a1.13 1.13 0 1 1-.66-2.16c4.24-1.29 11.28-1.04 15.73 1.6a1.13 1.13 0 1 1-1.13 1.95Z" />
    </svg>
  );
}
