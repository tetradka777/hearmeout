-- HearMeOut — migration 020: Follow on the artist page (redesign spec 6.7,
-- 7.8). A per-account list of followed artists, separate from Loved
-- artists (loved_items): Follow is the Follow / Following toggle in the
-- artist header. Same access convention as listen_later (migration 019):
-- only the server (service role) reads and writes it.
-- Run in Supabase SQL Editor after migration_019_listen_later.sql.

create table if not exists artist_follows (
  user_id uuid not null references users(id) on delete cascade,
  artist_id text not null,           -- Spotify artist id
  artist_name text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, artist_id)
);

create index if not exists artist_follows_user_idx on artist_follows (user_id, created_at desc);

alter table artist_follows enable row level security;

create policy "artist_follows_no_direct_access" on artist_follows
  for all using (false);
