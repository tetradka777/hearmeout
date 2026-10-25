-- 031: your own top 4 on the profile, track ratings, release reminders.
-- Apply in the Supabase SQL Editor. Safe to run twice.

-- Profile "top 4": album ids the person pinned themselves (in order, at
-- most four). Null = picked automatically from the best scores, as before.
alter table users add column if not exists pinned_albums text[];

-- Ratings of single tracks (0.1–5, tenths, like albums). One per person
-- per track (track_id = "<album id>:<track number>").
create table if not exists track_ratings (
  id bigint generated always as identity primary key,
  user_id uuid not null references users(id) on delete cascade,
  album_id text not null,
  track_id text not null,
  track_title text not null,
  stars numeric(2,1) not null check (stars >= 0.1 and stars <= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, track_id)
);
create index if not exists track_ratings_album_idx on track_ratings (album_id);
create index if not exists track_ratings_user_idx on track_ratings (user_id, created_at desc);
alter table track_ratings enable row level security;
-- Read and written by the server only (service role), like ratings since
-- migration 022: no policies for the anon key.

-- "Remind me on release day" for an announced album.
create table if not exists release_reminders (
  id bigint generated always as identity primary key,
  user_id uuid not null references users(id) on delete cascade,
  album_id text not null,
  title text not null,
  artist text not null,
  cover_url text,
  release_date date not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, album_id)
);
create index if not exists release_reminders_due_idx on release_reminders (release_date) where sent_at is null;
alter table release_reminders enable row level security;

-- The person's time zone (minutes, like the browser's getTimezoneOffset()),
-- for the evening "keep your rating streak" push.
alter table users add column if not exists tz_offset integer;
