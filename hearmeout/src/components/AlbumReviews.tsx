'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { supabase } from '@/lib/supabaseClient';
import { userAvatarStyle, formatRelative } from '@/lib/format';
import type { AlbumReview } from '@/lib/types';
import { Stars } from './redesign/Stars';

type Row = { stars: number; review: string | null; created_at: string; users: { name: string; handle: string; avatar_url: string | null } | null };
type ReviewWithTime = AlbumReview & { createdAt: string };

export function AlbumReviews({ albumId, refreshToken }: { albumId: string; refreshToken: number }) {
  const { t, language } = useApp();
  const [reviews, setReviews] = useState<ReviewWithTime[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReviews(null);
    supabase
      .from('ratings')
      .select('stars, review, created_at, users(name, handle, avatar_url)')
      .eq('album_id', albumId)
      .not('review', 'is', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data || []) as unknown as Row[];
        setReviews(
          rows
            .filter((r) => r.review)
            .map((r) => ({
              stars: r.stars,
              review: r.review as string,
              createdAt: r.created_at,
              user: { name: r.users?.name ?? '', handle: r.users?.handle ?? '', avatarUrl: r.users?.avatar_url ?? null },
            }))
        );
      });
    return () => { cancelled = true; };
  }, [albumId, refreshToken]);

  if (reviews === null) return <div className="muted">{t('reviews.loading')}</div>;
  if (!reviews.length) return <div className="tile empty"><p>{t('reviews.empty')}</p></div>;

  return (
    <div className="stack">
      {reviews.map((r, i) => (
        <div className="tile t-soft2" key={i}>
          <div className="ft top" style={{ marginBottom: 10 }}>
            <div className="dot" style={userAvatarStyle(r.user)}>{r.user.name[0]}</div>
            <div className="who"><b>{r.user.handle}</b></div>
            <Stars value={r.stars} size={14} />
            <small className="muted" style={{ marginLeft: 'auto' }}>{formatRelative(r.createdAt, language)}</small>
          </div>
          <p className="quote">&ldquo;{r.review}&rdquo;</p>
        </div>
      ))}
    </div>
  );
}
