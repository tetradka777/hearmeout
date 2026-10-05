-- Redesign: "Mute notifications" per group per user (prototype's group
-- hero, next to "Invite friends") — group_members already has one row per
-- (group_id, user_id), so a boolean column there is the natural fit; no
-- separate table needed.
alter table group_members add column if not exists muted boolean not null default false;
