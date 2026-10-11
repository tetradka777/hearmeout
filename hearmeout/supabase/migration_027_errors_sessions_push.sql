-- HearMeOut — migration 027: error log, "sign out everywhere", push.
-- Safe to run more than once. The site works before it's applied: errors
-- just aren't stored, "sign out everywhere" answers that it isn't set up,
-- and notifications can't be turned on.

-- 1) Errors from visitors' browsers and from the server (/api/errors,
--    lib/errorLog). Read them in the Table Editor; rows older than 30 days
--    are deleted by the hourly /api/health job.
create table if not exists app_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  source text not null check (source in ('client', 'server')),
  message text not null,
  stack text,
  url text,
  user_id uuid references users(id) on delete set null,
  user_agent text
);
create index if not exists app_errors_created_idx on app_errors (created_at desc);
alter table app_errors enable row level security; -- service role only

-- 2) "Sign out on all devices": the session cookie carries this number and
--    stops being valid when it's raised.
alter table users add column if not exists session_version integer not null default 0;

-- 3) Web push subscriptions (friend requests, the weekly recap).
create table if not exists push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  language text,
  last_recap_week text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);
alter table push_subscriptions enable row level security; -- service role only
