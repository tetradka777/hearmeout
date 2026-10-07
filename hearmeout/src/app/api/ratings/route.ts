import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUserId } from '@/lib/identity';
import { isReviewTagId, MAX_REVIEW_TAGS } from '@/lib/reviewTags';

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'not_registered' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const albumId = typeof body?.albumId === 'string' ? body.albumId : null;
  const stars = typeof body?.stars === 'number' ? body.stars : null;
  const review = typeof body?.review === 'string' && body.review.trim() ? body.review.trim() : null;
  const isPrivate = body?.isPrivate === true;
  const tags = Array.isArray(body?.tags)
    ? [...new Set(body.tags.filter((t: unknown): t is string => typeof t === 'string' && isReviewTagId(t)))].slice(0, MAX_REVIEW_TAGS)
    : [];
  // Same limits as the UI (0.1–5 stars, a 2000-character review); album ids
  // are catalog slugs or Spotify ids. Without these, a direct request could
  // store any amount of text or hit the database's own check with a 500.
  if (!albumId || albumId.length > 64 || !/^[A-Za-z0-9_-]+$/.test(albumId) || !stars || stars <= 0 || stars > 5 || (review && review.length > 2000)) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // A revision ("3.5 -> 4.5" in history) only exists once a *different*
  // score replaces an existing one — the very first rating of an album has
  // no previous score, and re-saving the same score isn't a revision.
  const { data: existing } = await admin.from('ratings').select('stars').eq('user_id', userId).eq('album_id', albumId).maybeSingle();
  const scoreChanged = existing != null && Number(existing.stars) !== stars;
  const keepPreviousOnNoChange = existing != null && !scoreChanged;
  const previousStars = scoreChanged ? existing!.stars : null;

  const { error } = await admin
    .from('ratings')
    .upsert(
      {
        user_id: userId,
        album_id: albumId,
        stars,
        review,
        tags,
        is_private: isPrivate,
        // Only overwrite previous_stars when the score actually changed —
        // editing just the review/tags shouldn't erase an earlier revision.
        ...(keepPreviousOnNoChange ? {} : { previous_stars: previousStars }),
      },
      { onConflict: 'user_id,album_id' }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
