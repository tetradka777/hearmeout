-- HearMeOut — migration 025: the five demo profiles.
--
-- The "no friends yet" strip and the landing page's example links point at
-- five fixed demo accounts (src/lib/demoAccounts.ts). They lived only in
-- the old, deleted database, so here they are recreated with the same ids:
-- distinct names, a few public ratings on catalog albums and some listening
-- history with genres, so their profiles and match % have something to
-- show. They have no login, are hidden from search (discoverable = false)
-- and can't send or receive friend requests (checked in the API).
-- Safe to run more than once.

insert into users (id, name, handle, discoverable, is_open_profile)
values
  ('546a1107-5b9d-421c-bf66-feb979e78c9f', 'mira',   '@demo_mira',   false, true),
  ('b9fa30ea-848d-4a4e-90f3-82cca01c9809', 'daniil', '@demo_daniil', false, true),
  ('810af81d-38e0-4c4b-ac82-9adc1c2665f7', 'ilya',   '@demo_ilya',   false, true),
  ('d4fd8251-a76c-4d9d-bff4-1816611b40e4', 'noa',    '@demo_noa',    false, true),
  ('0a6c4ca3-ed24-43ef-953f-de9f63923e7c', 'lena',   '@demo_lena',   false, true)
on conflict (id) do update
  set name = excluded.name, handle = excluded.handle, discoverable = false, is_open_profile = true;

-- Public ratings (one row per demo × album).
insert into ratings (user_id, album_id, stars, review, tags)
values
  ('546a1107-5b9d-421c-bf66-feb979e78c9f', 'ok-computer',     4.8, 'Still sounds like the future.', array['noSkips']),
  ('546a1107-5b9d-421c-bf66-feb979e78c9f', 'discovery',       4.5, null, array['onRepeat']),
  ('546a1107-5b9d-421c-bf66-feb979e78c9f', 'channel-orange',  4.2, null, null),
  ('546a1107-5b9d-421c-bf66-feb979e78c9f', 'rumours',         3.9, null, null),
  ('b9fa30ea-848d-4a4e-90f3-82cca01c9809', 'tpab',            5.0, 'The drums carry everything.', array['banger']),
  ('b9fa30ea-848d-4a4e-90f3-82cca01c9809', 'flower-boy',      4.4, null, null),
  ('b9fa30ea-848d-4a4e-90f3-82cca01c9809', 'luv-rage-2',      3.6, null, null),
  ('b9fa30ea-848d-4a4e-90f3-82cca01c9809', 'ok-computer',     4.0, null, null),
  ('810af81d-38e0-4c4b-ac82-9adc1c2665f7', 'dark-side',       4.7, null, array['headphonesOnly']),
  ('810af81d-38e0-4c4b-ac82-9adc1c2665f7', 'californication', 4.1, null, null),
  ('810af81d-38e0-4c4b-ac82-9adc1c2665f7', 'abbey-road',      4.6, null, null),
  ('810af81d-38e0-4c4b-ac82-9adc1c2665f7', 'purpose',         2.0, 'Pretty, but nothing moved.', null),
  ('d4fd8251-a76c-4d9d-bff4-1816611b40e4', 'dtmf',            5.0, 'Best record I heard this year.', array['obsession']),
  ('d4fd8251-a76c-4d9d-bff4-1816611b40e4', 'thriller',        4.6, null, null),
  ('d4fd8251-a76c-4d9d-bff4-1816611b40e4', 'discovery',       4.3, null, null),
  ('0a6c4ca3-ed24-43ef-953f-de9f63923e7c', 'rumours',         4.4, 'Grew on me by the fourth listen.', array['grower']),
  ('0a6c4ca3-ed24-43ef-953f-de9f63923e7c', 'abbey-road',      4.9, null, null),
  ('0a6c4ca3-ed24-43ef-953f-de9f63923e7c', 'channel-orange',  3.8, null, null)
on conflict (user_id, album_id) do nothing;

-- Listening history over the last two weeks: each demo leans to its own
-- genres, so their taste profiles (and match %) differ.
insert into listening_events (user_id, track_id, track_title, artist, genre, played_at, duration_ms, source)
select d.id,
       'demo-' || left(d.id::text, 8) || '-' || n,
       'Demo track ' || n,
       d.artists[1 + (n % array_length(d.artists, 1))],
       d.genres[1 + (n % array_length(d.genres, 1))],
       now() - (n * interval '7 hours'),
       200000,
       'spotify'
from (values
  ('546a1107-5b9d-421c-bf66-feb979e78c9f'::uuid, array['Radiohead','Daft Punk','Frank Ocean'], array['Rock','Electronic','R&B','Electronic']),
  ('b9fa30ea-848d-4a4e-90f3-82cca01c9809'::uuid, array['Kendrick Lamar','Tyler, The Creator','Lil Uzi Vert'], array['Hip-Hop','Hip-Hop','R&B']),
  ('810af81d-38e0-4c4b-ac82-9adc1c2665f7'::uuid, array['Pink Floyd','Red Hot Chili Peppers','The Beatles'], array['Rock','Rock','Pop']),
  ('d4fd8251-a76c-4d9d-bff4-1816611b40e4'::uuid, array['Bad Bunny','Michael Jackson','Daft Punk'], array['Latin','Pop','Electronic']),
  ('0a6c4ca3-ed24-43ef-953f-de9f63923e7c'::uuid, array['Fleetwood Mac','The Beatles','Frank Ocean'], array['Rock','Pop','R&B'])
) as d(id, artists, genres)
cross join generate_series(1, 40) as n
on conflict (user_id, track_id, played_at) do nothing;
