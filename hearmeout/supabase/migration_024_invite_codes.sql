-- HearMeOut — migration 024: invite codes.
--
-- Invite links used the account's internal id (/invite/<uuid>). They now
-- use a separate random code (/invite/<code>); old id links keep working.
-- Safe to run more than once.

alter table users add column if not exists invite_code text;

-- 12 hex characters from md5(random); no extension needed.
alter table users alter column invite_code set default substr(md5(random()::text || clock_timestamp()::text), 1, 12);

update users
set invite_code = substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 12)
where invite_code is null;

create unique index if not exists users_invite_code_key on users (invite_code);
