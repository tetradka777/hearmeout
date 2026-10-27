-- 034: a group's own cover — an album cover link or a small picture a member
-- uploaded (a data: URL, shrunk on the device), shown blurred behind the
-- group's card. Null = the group's best album of the month, as before.
-- Apply in the Supabase SQL Editor. Safe to run twice; changes no data.
alter table groups add column if not exists cover text;
