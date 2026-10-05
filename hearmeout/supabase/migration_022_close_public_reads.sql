-- HearMeOut — migration 022: close direct reads with the public anon key.
-- These tables had "publicly readable" policies (using (true)), so anyone
-- with the anon key shipped in the frontend could read every user (with
-- settings), every rating incl. private ones and review texts, friendships
-- and groups via Supabase's REST API. The app now reads all of this on the
-- server (service role), so direct access is removed.
-- Run in Supabase SQL Editor after migration_021_notifications.sql.

-- A DO block, because "drop policy if exists ... on t" still fails when the
-- table t itself doesn't exist (e.g. loved_tracks, replaced by loved_items).
do $$
declare
  t text;
begin
  foreach t in array array['users', 'ratings', 'friendships', 'groups', 'group_members', 'group_votes', 'loved_tracks', 'loved_items'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', t || ' are publicly readable', t);
    end if;
  end loop;
end
$$;
