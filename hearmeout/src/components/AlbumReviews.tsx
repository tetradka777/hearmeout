'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { ReviewCard } from './ui/SuperCards';
import type { AlbumReview } from '@/lib/types';

type ReviewWithTime = AlbumReview & { createdAt: string; tags?: string[] };

export function AlbumReviews({ albumId, refreshToken }: { albumId: string; refreshToken: number }) {
  const { t } = useApp();
  const [reviews, setReviews] = useState<ReviewWithTime[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReviews(null);
    // Server-side: skips private ratings and respects "Public reviews".
    fetch(`/api/albums/${encodeURIComponent(albumId)}/reviews`)
      .then((r) => (r.ok ? r.json() : { reviews: [] }))
      .then((d: { reviews: ReviewWithTime[] }) => { if (!cancelled) setReviews(d.reviews); })
      .catch(() => { if (!cancelled) setReviews([]); });
    return () => { cancelled = true; };
  }, [albumId, refreshToken]);

  if (reviews === null) return <div className="muted">{t('reviews.loading')}</div>;
  if (!reviews.length) return <p className="muted">{t('reviews.empty')}</p>;

  return (
    <div className="stack">
      {reviews.map((r, i) => (
        <ReviewCard key={i} user={r.user} createdAt={r.createdAt} stars={r.stars} review={r.review} tags={r.tags} albumId={albumId} showAlbum={false} clamp={false} />
      ))}
    </div>
  );
}
