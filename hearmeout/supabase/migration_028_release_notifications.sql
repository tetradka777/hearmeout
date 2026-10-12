-- HearMeOut — migration 028: "new release" notifications.
-- Safe to run more than once. Run after migration_027_errors_sessions_push.sql.
-- Before it's applied the site works as before: no release notifications
-- are created and the two Settings switches simply don't save.

-- 1) Settings → Notifications: releases by the artists you listen to (on by
--    default) and by the most popular artists (off by default).
alter table users add column if not exists notify_releases_mine boolean not null default true;
alter table users add column if not exists notify_releases_popular boolean not null default false;

-- 2) A release notification has no sender (it comes from the site itself).
alter table notifications alter column actor_id drop not null;
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check check (kind in ('hi', 'recap', 'release'));

-- 3) One notification per release per person.
create unique index if not exists notifications_release_once
  on notifications (user_id, (payload->>'albumId')) where kind = 'release';
