-- HearMeOut — migration 021: in-app notifications. Backs "Say hi" on a
-- friend's profile and "Send to friends" on the recap, which used to only
-- copy text to the clipboard because there was nowhere to deliver them.
-- Same access convention as listen_later / artist_follows: only the server
-- (service role) reads and writes it.
-- Run in Supabase SQL Editor after migration_020_artist_follows.sql.

create table if not exists notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references users(id) on delete cascade,   -- recipient
  actor_id uuid not null references users(id) on delete cascade,  -- sender
  kind text not null check (kind in ('hi', 'recap')),
  payload jsonb not null default '{}'::jsonb,  -- recap: { "period": "week", "offset": 0 }
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_user_idx on notifications (user_id, created_at desc);
create index if not exists notifications_actor_idx on notifications (actor_id, kind, created_at desc);

alter table notifications enable row level security;

create policy "notifications_no_direct_access" on notifications
  for all using (false);
