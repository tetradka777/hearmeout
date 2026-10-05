-- HearMeOut — migration 023: "Detect from my streaming account" for the
-- region (Settings → Language & region, spec 7.1). region_auto is the
-- switch (on by default); detected_region is the country of the connected
-- Spotify account (/v1/me), refreshed on connect and on every sync. While
-- region_auto is on, region follows detected_region.
-- Run in Supabase SQL Editor after migration_022_close_public_reads.sql.

alter table users add column if not exists region_auto boolean not null default true;
alter table users add column if not exists detected_region text;
