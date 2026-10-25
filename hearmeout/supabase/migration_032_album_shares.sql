-- 032: "a friend shared an album with you" notifications.
-- Apply in the Supabase SQL Editor. Safe to run twice; changes no data.
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('hi', 'recap', 'release', 'comment', 'reaction', 'album'));
