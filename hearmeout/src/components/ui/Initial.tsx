// A small geometric character for profiles without an uploaded photo.
export function Initial({ name: _name }: { name: string }) {
  return <svg className="davatar28" viewBox="0 0 64 64" aria-hidden="true" style={{ position: 'static', width: '70%', height: '70%', transform: 'none', stroke: 'none' }}>
    <rect x="14" y="6" width="36" height="34" rx="11" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 4 }} />
    <circle cx="25" cy="21" r="3" style={{ fill: 'currentColor', stroke: 'none' }} />
    <circle cx="39" cy="21" r="3" style={{ fill: 'currentColor', stroke: 'none' }} />
    <path d="M26 30q6 5 12 0" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round' }} />
    <path d="M10 58v-3c0-9 9-14 22-14s22 5 22 14v3z" style={{ fill: 'currentColor', stroke: 'none' }} />
  </svg>;
}
