-- HearMeOut — cleanup 026: duplicate plays from history import + sync.
--
-- The Extended Streaming History import stores play times in whole seconds;
-- the Spotify sync used to keep milliseconds. The same play imported and
-- synced therefore got two rows (the unique key saw different times) — one
-- with album and cover (sync), one without (import). The sync now stores
-- whole seconds too, so this can't happen again; this removes the copies
-- already there, keeping the row with an album (or the older one).
-- Safe to run more than once.

-- 1) Preview: how many rows would go, per user.
select a.user_id, count(*) as duplicates
from listening_events a
join listening_events b
  on a.user_id = b.user_id
 and a.track_id = b.track_id
 and a.id <> b.id
 and date_trunc('second', a.played_at) = date_trunc('second', b.played_at)
where (a.album_id is null and b.album_id is not null)
   or ((a.album_id is null) = (b.album_id is null) and a.id > b.id)
group by a.user_id;

-- 2) Delete them.
delete from listening_events a
using listening_events b
where a.user_id = b.user_id
  and a.track_id = b.track_id
  and a.id <> b.id
  and date_trunc('second', a.played_at) = date_trunc('second', b.played_at)
  and ((a.album_id is null and b.album_id is not null)
    or ((a.album_id is null) = (b.album_id is null) and a.id > b.id));
