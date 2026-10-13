-- HearMeOut — migration 029: comments and reactions (after Superfan).
-- Safe to run more than once. Run after migration_028_release_notifications.sql.
-- Before it's applied the site works as before: the comment and reaction
-- buttons show nothing and saving one fails quietly.
--
-- A "target" is a string naming what is commented on or reacted to:
--   review:<userId>:<albumId>            a rating / review
--   play:<userId>:<albumId>:<yyyy-mm-dd>  a friend's play in the feed
--   recap:<userId>:<period>:<start>       a recap (start = window start date)
--   award:<groupId>:<yyyy-mm>:<label>     a group award

-- 1) Comments.
create table if not exists social_comments (
  id bigserial primary key,
  target text not null,
  user_id uuid not null references users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists social_comments_target_idx on social_comments (target, created_at);

-- 2) Reactions: one of five per person per target, each at most once.
create table if not exists social_reactions (
  target text not null,
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('heart', 'flame', 'spark', 'repeat', 'star')),
  created_at timestamptz not null default now(),
  primary key (target, user_id, kind)
);
create index if not exists social_reactions_target_idx on social_reactions (target);

-- Read and written only by the server (service role), like the other tables.
alter table social_comments enable row level security;
alter table social_reactions enable row level security;
drop policy if exists "social_comments_no_direct_access" on social_comments;
create policy "social_comments_no_direct_access" on social_comments for all using (false);
drop policy if exists "social_reactions_no_direct_access" on social_reactions;
create policy "social_reactions_no_direct_access" on social_reactions for all using (false);

-- 3) Notifications for comments and reactions.
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check check (kind in ('hi', 'recap', 'release', 'comment', 'reaction'));
