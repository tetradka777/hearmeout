-- Redesign: new design system (Cream Pop / Toxic, 13 palettes, light/dark/
-- system) plus its own settings, replacing the old single warm-dark/milky-
-- light theme and the premium accent-theme system (accent_theme,
-- accent_toxicity stay in the table for now, unused, rather than dropped --
-- dropping columns is destructive; do it later in a separate cleanup pass
-- once the redesign has shipped and nobody needs to roll back).
--
-- Premium is being removed from the product entirely, so nothing here is
-- gated: these columns are plain account settings for every user.
alter table users add column if not exists design text not null default 'cream-pop';
alter table users add column if not exists mode text not null default 'light';
alter table users add column if not exists palette text not null default 'lemons';
alter table users add column if not exists ticker_enabled boolean not null default true;
alter table users add column if not exists motion_enabled boolean not null default true;
alter table users add column if not exists time_format text not null default '24';
alter table users add column if not exists week_start text not null default 'mon';

-- New privacy switches (redesign spec 7.1 "Privacy" section). is_open_profile
-- (added in migration_013) already covers "Private profile".
alter table users add column if not exists ratings_visible boolean not null default true;
alter table users add column if not exists share_live boolean not null default true;
alter table users add column if not exists public_reviews boolean not null default true;
alter table users add column if not exists discoverable boolean not null default true;

alter table users add constraint users_design_check check (design in ('cream-pop', 'toxic'));
alter table users add constraint users_mode_check check (mode in ('light', 'dark', 'system'));
alter table users add constraint users_time_format_check check (time_format in ('24', '12'));
alter table users add constraint users_week_start_check check (week_start in ('mon', 'sun'));
