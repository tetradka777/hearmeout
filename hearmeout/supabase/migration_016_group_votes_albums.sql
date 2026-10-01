-- Redesign: "Album of the month vote" (spec 6.6 item 8) votes on an ALBUM,
-- not a group member — migration_008 built member voting, which is what
-- the original (pre-redesign) site actually had. candidate_id now stores
-- an album id (text, same convention as ratings.album_id) instead of a
-- foreign key to users.
alter table group_votes drop constraint if exists group_votes_candidate_id_fkey;
alter table group_votes alter column candidate_id type text using candidate_id::text;
