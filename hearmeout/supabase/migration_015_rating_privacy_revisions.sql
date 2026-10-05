-- Redesign: "Keep private" ratings (spec 6.2/7.4) and revision tracking
-- ("3.5 -> 4.5" shown in history, spec 6.13) — neither existed before.
alter table ratings add column if not exists is_private boolean not null default false;
alter table ratings add column if not exists previous_stars numeric(2,1);
