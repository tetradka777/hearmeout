-- HearMeOut — migration 022: close direct reads with the public anon key.
-- These tables had "publicly readable" policies (using (true)), so anyone
-- with the anon key shipped in the frontend could read every user (with
-- settings), every rating incl. private ones and review texts, friendships
-- and groups via Supabase's REST API. The app now reads all of this on the
-- server (service role), so direct access is removed.
-- Run in Supabase SQL Editor after migration_021_notifications.sql.

drop policy if exists "users are publicly readable" on users;
drop policy if exists "ratings are publicly readable" on ratings;
drop policy if exists "friendships are publicly readable" on friendships;
drop policy if exists "groups are publicly readable" on groups;
drop policy if exists "group_members are publicly readable" on group_members;
drop policy if exists "group_votes are publicly readable" on group_votes;
drop policy if exists "loved_tracks are publicly readable" on loved_tracks;
drop policy if exists "loved_items are publicly readable" on loved_items;
