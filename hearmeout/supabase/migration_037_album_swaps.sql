-- Private blind album exchanges. Scores belong to listeners, not album givers.
create table if not exists public.album_swaps (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.users(id) on delete cascade,
  user_b uuid not null references public.users(id) on delete cascade,
  album_a jsonb not null,
  album_b jsonb,
  note_a text not null default '',
  note_b text not null default '',
  score_a numeric,
  score_b numeric,
  reaction_a text,
  reaction_b text,
  finished_a timestamptz,
  finished_b timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  constraint album_swaps_distinct_users check (user_a <> user_b),
  constraint album_swaps_note_lengths check (char_length(note_a) <= 500 and char_length(note_b) <= 500),
  constraint album_swaps_reaction_lengths check (char_length(reaction_a) <= 2000 and char_length(reaction_b) <= 2000),
  constraint album_swaps_score_a check (score_a between 0.1 and 5 and score_a = round(score_a, 1)),
  constraint album_swaps_score_b check (score_b between 0.1 and 5 and score_b = round(score_b, 1)),
  constraint album_swaps_finish_a check ((finished_a is null and score_a is null and reaction_a is null) or (finished_a is not null and score_a is not null)),
  constraint album_swaps_finish_b check ((finished_b is null and score_b is null and reaction_b is null) or (finished_b is not null and score_b is not null)),
  constraint album_swaps_both_albums check ((finished_a is null and finished_b is null) or album_b is not null),
  constraint album_swaps_completion check ((completed_at is not null) = (finished_a is not null and finished_b is not null)),
  constraint album_swaps_closure check (completed_at is null or cancelled_at is null)
);

create unique index if not exists album_swaps_active_pair_idx
  on public.album_swaps (least(user_a, user_b), greatest(user_a, user_b))
  where completed_at is null and cancelled_at is null;
create index if not exists album_swaps_a_created_idx on public.album_swaps (user_a, created_at desc);
create index if not exists album_swaps_b_created_idx on public.album_swaps (user_b, created_at desc);
alter table public.album_swaps enable row level security;
revoke all on public.album_swaps from public, anon, authenticated;
grant all on public.album_swaps to service_role;

-- All writes in the cookie-authenticated server route use this transaction.
-- The caller is service_role; actor UUID is always supplied from the verified cookie.
create or replace function public.mutate_album_swap(
  p_actor uuid,
  p_action text,
  p_swap_id uuid default null,
  p_friend uuid default null,
  p_album jsonb default null,
  p_note text default '',
  p_score numeric default null,
  p_reaction text default ''
) returns setof public.album_swaps
language plpgsql security invoker set search_path = ''
as $$
declare
  v public.album_swaps;
  v_is_a boolean;
  v_friend_count integer;
begin
  if p_actor is null or p_action is null or p_action not in ('create', 'pick', 'finish', 'cancel') then
    raise exception using errcode = 'P0001', message = 'invalid_payload';
  end if;
  if p_action in ('create', 'pick') then
    -- p_album is resolved from the trusted catalog by the server, never from request JSON.
    if p_album is null or jsonb_typeof(p_album) <> 'object'
      or jsonb_typeof(p_album->'albumId') is distinct from 'string'
      or jsonb_typeof(p_album->'title') is distinct from 'string'
      or jsonb_typeof(p_album->'artist') is distinct from 'string'
      or jsonb_typeof(p_album->'cover') is distinct from 'string'
      or char_length(p_album->>'albumId') not between 1 and 160
      or p_note is null or char_length(p_note) > 500 then
      raise exception using errcode = 'P0001', message = 'invalid_payload';
    end if;
  end if;
  if p_action = 'create' then
    if p_friend is null or p_friend = p_actor then
      raise exception using errcode = 'P0001', message = 'invalid_payload';
    end if;
    -- Lock both accepted friendship directions against concurrent unfriending.
    -- Stable ordering prevents reciprocal creates from acquiring locks in opposite order.
    perform user_id from public.friendships
      where (user_id = p_actor and friend_id = p_friend)
         or (user_id = p_friend and friend_id = p_actor)
      order by user_id for key share;
    get diagnostics v_friend_count = row_count;
    if v_friend_count <> 2 then
      raise exception using errcode = 'P0001', message = 'friends_required';
    end if;
    insert into public.album_swaps (user_a, user_b, album_a, note_a)
      values (p_actor, p_friend, p_album, p_note) returning * into v;
    return next v;
    return;
  end if;

  select * into v from public.album_swaps where id = p_swap_id for update;
  if not found or (p_actor <> v.user_a and p_actor <> v.user_b) then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if v.completed_at is not null or v.cancelled_at is not null then
    raise exception using errcode = 'P0001', message = 'swap_closed';
  end if;
  v_is_a := p_actor = v.user_a;
  if p_action = 'cancel' then
    update public.album_swaps set cancelled_at = now() where id = v.id returning * into v;
  elsif p_action = 'pick' then
    if v.finished_a is not null or v.finished_b is not null then
      raise exception using errcode = 'P0001', message = 'swap_locked';
    end if;
    update public.album_swaps set
      album_a = case when v_is_a then p_album else album_a end,
      album_b = case when v_is_a then album_b else p_album end,
      note_a = case when v_is_a then p_note else note_a end,
      note_b = case when v_is_a then note_b else p_note end
      where id = v.id returning * into v;
  elsif p_action = 'finish' then
    if p_score is null or p_score not between 0.1 and 5 or p_score <> round(p_score, 1)
      or p_reaction is null or char_length(p_reaction) > 2000 then
      raise exception using errcode = 'P0001', message = 'invalid_payload';
    end if;
    if v.album_a is null or v.album_b is null then
      raise exception using errcode = 'P0001', message = 'missing_album';
    end if;
    if (v_is_a and v.finished_a is not null) or (not v_is_a and v.finished_b is not null) then
      raise exception using errcode = 'P0001', message = 'already_finished';
    end if;
    -- Each listener scores ONLY their received album. Other side fields never come from the caller.
    -- The row lock serializes both finishes and any simultaneous pick/cancel.
    update public.album_swaps set
      score_a = case when v_is_a then p_score else score_a end,
      score_b = case when v_is_a then score_b else p_score end,
      reaction_a = case when v_is_a then p_reaction else reaction_a end,
      reaction_b = case when v_is_a then reaction_b else p_reaction end,
      finished_a = case when v_is_a then now() else finished_a end,
      finished_b = case when v_is_a then finished_b else now() end,
      completed_at = case when (v_is_a and v.finished_b is not null) or (not v_is_a and v.finished_a is not null) then now() else null end
      where id = v.id returning * into v;
  end if;
  return next v;
end;
$$;

revoke all on function public.mutate_album_swap(uuid, text, uuid, uuid, jsonb, text, numeric, text) from public, anon, authenticated;
grant execute on function public.mutate_album_swap(uuid, text, uuid, uuid, jsonb, text, numeric, text) to service_role;
