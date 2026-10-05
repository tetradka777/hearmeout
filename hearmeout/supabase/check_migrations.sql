-- HearMeOut — read-only check: which of migrations 014–023 are applied in
-- this database. Paste into Supabase SQL Editor and Run; it changes nothing.
-- "true" = applied. Apply the missing ones in number order.
select
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'design')            as m014_redesign_appearance,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ratings' and column_name = 'is_private')      as m015_rating_privacy,
  (select data_type = 'text' from information_schema.columns where table_schema = 'public' and table_name = 'group_votes' and column_name = 'candidate_id') as m016_group_votes_albums,
  to_regclass('public.wishlist') is not null                                                                                                   as m017_wishlist,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'group_members' and column_name = 'muted')     as m018_group_mute,
  to_regclass('public.listen_later') is not null                                                                                               as m019_listen_later,
  to_regclass('public.artist_follows') is not null                                                                                             as m020_artist_follows,
  to_regclass('public.notifications') is not null                                                                                              as m021_notifications,
  not exists (select 1 from pg_policies where schemaname = 'public' and policyname like '%are publicly readable')                              as m022_close_public_reads,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'region_auto')     as m023_region_detect;
