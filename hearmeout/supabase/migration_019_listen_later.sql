-- HearMeOut — migration 019: Listen later (redesign spec 13.20). Replaces
-- the wishlist toggle (migration 017) — the old button only flipped a
-- label on the album screen with no list to show for it. This is a real
-- per-account list of albums AND tracks, modelled on loved_items
-- (migration 010) rather than wishlist: items are shown back to the user
-- on their own /later screen, so reads go through the owner's session the
-- same way loved_items does, not the "no direct access" private
-- convention wishlist used.
create table if not exists listen_later (
  id bigint generated always as identity primary key,
  user_id uuid not null references users(id) on delete cascade,
  item_type text not null check (item_type in ('album','track')),
  album_id text not null,            -- the album (for a track: the album it belongs to)
  track_index int,                   -- null for albums
  title text not null,
  artist text,
  cover_url text,
  created_at timestamptz not null default now(),
  unique (user_id, item_type, album_id, track_index)
);

create index if not exists listen_later_user_idx on listen_later (user_id, created_at desc);

alter table listen_later enable row level security;

-- drop first so re-running this migration is safe
drop policy if exists "listen_later_no_direct_access" on listen_later;
create policy "listen_later_no_direct_access" on listen_later
  for all using (false);
