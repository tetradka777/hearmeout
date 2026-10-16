-- Region: the United States by default; "detect from my streaming account"
-- is off unless the person turns it on (then the Spotify account's country
-- is taken once, see lib/regionDetect.ts).
alter table users alter column region set default 'US';
update users set region = 'US' where region is null;

alter table users alter column region_auto set default false;
update users set region_auto = false;
