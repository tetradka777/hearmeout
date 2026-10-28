-- 035: reminders for "listen later" items — when the next one is due and how
-- often it repeats (null = once). Sent by lib/laterReminders from the
-- /api/health ping, as a 'later' notification plus a push; they don't count
-- towards the daily limit of release notifications.
-- Apply in the Supabase SQL Editor. Safe to run twice; changes no data.
alter table listen_later add column if not exists remind_at timestamptz;
alter table listen_later add column if not exists remind_every text
  check (remind_every in ('day', 'week', 'month'));
create index if not exists listen_later_remind_at_idx on listen_later (remind_at) where remind_at is not null;

alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('hi', 'recap', 'release', 'comment', 'reaction', 'album', 'later'));
