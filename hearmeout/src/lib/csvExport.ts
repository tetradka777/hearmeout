import type { Album, RatingRecord } from './types';

// Guards a field against CSV formula injection: Excel/Sheets runs a cell
// starting with =, +, - or @ as a formula when the sheet opens, so a
// review someone wrote (or even an album title) starting with one of
// those is prefixed with a literal quote to force it back to text
// (redesign fix, item 19).
function csvField(s: string): string {
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

// The ratings CSV export (spec 7.1/9.9) — reachable from both the History
// screen and Settings > Privacy's "Export my data (CSV)" button, same
// file both times (matches the prototype's own doCsv(), called from both
// places). `albumOf` resolves an albumId the same way each caller already
// does (liveAlbums-then-catalog) — a rating whose album never resolves
// still exports with its raw id instead of being silently dropped
// (redesign fix, item 19).
export function exportRatingsCsv(ratings: RatingRecord[], albumOf: (albumId: string) => Album | undefined) {
  const rows = [['date', 'title', 'artist', 'score', 'previous_score', 'review', 'private', 'tags']];
  for (const r of ratings) {
    const a = albumOf(r.albumId);
    rows.push([
      r.createdAt,
      csvField(a?.title ?? r.albumId),
      csvField(a?.artist ?? ''),
      r.stars.toFixed(1),
      r.previousStars != null ? r.previousStars.toFixed(1) : '',
      csvField(r.review || ''),
      r.isPrivate ? 'true' : 'false',
      csvField(r.tags.join(', ')),
    ]);
  }
  const csv = rows.map((row) => row.join(',')).join('\n');
  // Leading BOM so Excel on Windows (the common case for a CSV export)
  // opens non-Latin titles/reviews as UTF-8 instead of misreading them
  // through the system codepage (redesign fix, item 19).
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'hearmeout-ratings.csv';
  link.click();
  URL.revokeObjectURL(url);
}
