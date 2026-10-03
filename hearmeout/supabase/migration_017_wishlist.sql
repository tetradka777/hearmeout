-- HearMeOut — migration 017: "Want to listen" wishlist toggle on the
-- album/rate page. Previously a local useState in RateScreen that reset
-- to false on every album change and was never persisted anywhere —
-- removed outright rather than shipped as a fake toggle (see "Rate: remove
-- fake wishlist toggle" on the redesign branch). This gives it a real
-- table.
--
-- Shape mirrors loved_items (migration_010): one row per user per album,
-- album_id is the same free-form text id ratings.album_id already uses
-- (curated catalog id or a live Spotify id — no FK, since not every album
-- source has a stable backing row).
--
-- Unlike loved_items, nothing in the product shows another user's
-- wishlist (it's just the owner's own toggle state), so this follows
-- match_snapshots' (migration_012) private convention instead: only the
-- service-role API routes (app/api/wishlist) read or write this table.
create table if not exists wishlist (
  id bigint generated always as identity primary key,
  user_id uuid not null references users(id) on delete cascade,
  album_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, album_id)
);

create index if not exists wishlist_user_idx on wishlist (user_id, created_at desc);

alter table wishlist enable row level security;

create policy "wishlist_no_direct_access" on wishlist
  for all using (false);
