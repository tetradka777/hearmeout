-- 033: everything the home feed reads, in one call (/api/feed).
-- The feed used to make two or three trips to the database one after
-- another; this returns the same rows at once. Only the server (service
-- role) may call it — it reads any account's friends and plays.
-- Apply in the Supabase SQL Editor. Safe to run twice; changes no data.
create or replace function feed_raw(p_user uuid, p_day_start timestamptz)
returns jsonb
language sql
stable
set search_path = public
as $$
  with
  friends as (
    select friend_id as id from friendships where user_id = p_user
  ),
  friend_ratings as (
    select r.user_id, r.album_id, r.stars, r.review, r.created_at, r.is_private
    from ratings r
    where r.user_id in (select id from friends)
      and r.created_at >= now() - interval '30 days'
    order by r.created_at desc
    limit 1000
  ),
  today as (
    select e.user_id, e.track_id, e.track_title, e.artist, e.album_id, e.cover_url, e.played_at
    from listening_events e
    where e.user_id in (select id from friends)
      and e.played_at >= p_day_start
    order by e.played_at desc
    limit 300
  ),
  -- "First play": the (friend, track) pairs of today that also appear in
  -- that friend's previous 30 days. A track is its id, or its title when
  -- it has no id (as the feed compares them).
  today_keys as (
    select distinct user_id, coalesce(nullif(track_id, ''), nullif(track_title, ''), '') as k from today
  ),
  seen as (
    select distinct o.user_id, coalesce(nullif(o.track_id, ''), nullif(o.track_title, ''), '') as k
    from listening_events o
    join today_keys t on t.user_id = o.user_id
      and t.k = coalesce(nullif(o.track_id, ''), nullif(o.track_title, ''), '')
    where o.played_at >= now() - interval '30 days'
      and o.played_at < p_day_start
  )
  select jsonb_build_object(
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'name', u.name, 'handle', u.handle, 'avatar_url', u.avatar_url,
        'ratings_visible', u.ratings_visible, 'share_live', u.share_live, 'public_reviews', u.public_reviews))
      from users u where u.id in (select id from friends)), '[]'::jsonb),
    'friend_ratings', coalesce((select jsonb_agg(to_jsonb(fr) order by fr.created_at desc) from friend_ratings fr), '[]'::jsonb),
    'my_ratings', coalesce((
      select jsonb_agg(jsonb_build_object('album_id', r.album_id, 'stars', r.stars))
      from ratings r
      where r.user_id = p_user and r.album_id in (select album_id from friend_ratings)), '[]'::jsonb),
    'today', coalesce((select jsonb_agg(to_jsonb(t) order by t.played_at desc) from today t), '[]'::jsonb),
    'seen', coalesce((select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'k', s.k)) from seen s), '[]'::jsonb),
    'my_session', coalesce((
      select jsonb_agg(jsonb_build_object(
        'duration_ms', e.duration_ms, 'artist', e.artist, 'album_id', e.album_id,
        'cover_url', e.cover_url, 'played_at', e.played_at, 'track_title', e.track_title))
      from listening_events e
      where e.user_id = p_user and e.played_at >= p_day_start), '[]'::jsonb),
    'my_recent', coalesce((
      select jsonb_agg(jsonb_build_object('album_id', x.album_id) order by x.played_at desc)
      from (
        select e.album_id, e.played_at
        from listening_events e
        where e.user_id = p_user and e.album_id is not null
          and e.played_at >= p_day_start - interval '14 days' and e.played_at < p_day_start
        order by e.played_at desc
        limit 1000
      ) x), '[]'::jsonb)
  );
$$;

revoke all on function feed_raw(uuid, timestamptz) from public, anon, authenticated;
grant execute on function feed_raw(uuid, timestamptz) to service_role;
