'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { REVIEW_TAG_LABEL_KEY, isReviewTagId, type ReviewTagId } from '@/lib/reviewTags';

const MAX_SHOWN = 8;

// Real per-tag counts across every rating for this album, not a curated
// pick — same "no fabricated data" standard as the rest of the app. Renders
// nothing at all while loading or once loaded with zero tagged ratings,
// same convention StatsScreen uses for its genre split (skip the section
// entirely rather than showing an empty header).
export function AlbumTagsSummary({ albumId, refreshToken }: { albumId: string; refreshToken: number }) {
  const { t } = useApp();
  const [counts, setCounts] = useState<{ id: ReviewTagId; count: number }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCounts(null);
    // Server-side aggregate (no private ratings, no user ids).
    fetch(`/api/albums/${encodeURIComponent(albumId)}/stats`)
      .then((r) => (r.ok ? r.json() : { tags: [] }))
      .then((d: { tags: string[][] }) => {
        if (cancelled) return;
        const tally = new Map<ReviewTagId, number>();
        for (const tags of d.tags) {
          for (const tag of tags) {
            if (!isReviewTagId(tag)) continue;
            tally.set(tag, (tally.get(tag) || 0) + 1);
          }
        }
        const sorted = [...tally.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, MAX_SHOWN)
          .map(([id, count]) => ({ id, count }));
        setCounts(sorted);
      });
    return () => { cancelled = true; };
  }, [albumId, refreshToken]);

  if (!counts || !counts.length) return null;

  // Caption and chips together, so an album without tagged reviews shows
  // neither (no empty heading).
  return (
    <>
    <p className="muted" style={{ fontWeight: 800, fontSize: 13, margin: '16px 0 8px' }}>{t('album.vibesFromReviews')}</p>
    <div className="chips" style={{ margin: 0 }}>
      {counts.map(({ id, count }) => (
        <span key={id} className="chip" style={{ cursor: 'default' }}>{t(REVIEW_TAG_LABEL_KEY[id])} · {count}</span>
      ))}
    </div>
    </>
  );
}
