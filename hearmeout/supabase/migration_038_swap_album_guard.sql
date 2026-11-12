-- Guard swap finishes against a gift changed since the listener reviewed it.
-- Same RPC signature and existing grants; p_album carries the expected received id.
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
    -- Compare the gift actually reviewed with the locked current gift. A row
    -- lock alone cannot detect a pick committed before this finish request.
    if p_album is null or jsonb_typeof(p_album) <> 'object'
      or jsonb_typeof(p_album->'albumId') is distinct from 'string'
      or char_length(p_album->>'albumId') not between 1 and 160 then
      raise exception using errcode = 'P0001', message = 'invalid_payload';
    end if;
    if (case when v_is_a then v.album_b->>'albumId' else v.album_a->>'albumId' end)
      is distinct from p_album->>'albumId' then
      raise exception using errcode = 'P0001', message = 'album_changed';
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
