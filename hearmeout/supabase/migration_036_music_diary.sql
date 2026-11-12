-- Private music diary. Reads/writes go through cookie-authenticated handlers;
-- the service role alone can access the table through the Data API.
create table if not exists public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  album_id text not null check (char_length(album_id) between 1 and 200),
  album_title text not null,
  artist text not null,
  cover_url text,
  moment text not null check (char_length(btrim(moment)) between 1 and 120),
  note text not null default '' check (char_length(note) <= 2000),
  mood text check (mood in ('calm', 'nostalgic', 'energised')),
  listened_on date not null check (listened_on between date '0001-01-01' and date '9999-12-31'),
  visibility text not null default 'private' check (visibility in ('private', 'friends')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists diary_entries_owner_date_idx
  on public.diary_entries (user_id, listened_on desc, created_at desc, id desc);
create index if not exists diary_entries_shared_date_idx
  on public.diary_entries (user_id, listened_on desc, created_at desc, id desc)
  where visibility = 'friends';

alter table public.diary_entries enable row level security;
revoke all on public.diary_entries from public, anon, authenticated;
grant all on public.diary_entries to service_role;
