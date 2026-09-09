-- Impede interferência entre salas criadas simultaneamente.
--
-- A 0021 fechava salas vazias depois de uma troca de identidade, mas o UPDATE
-- não estava limitado às salas anteriores daquela identidade. Entre
-- `create_room` e o primeiro `join_room`, uma sala válida fica brevemente sem
-- players; uma entrada concorrente em outra sala conseguia fechá-la.

create or replace function join_room(
  p_pin text, p_nickname text, p_color text, p_avatar_seed text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_room           uuid;
  v_join           jsonb;
  v_previous_rooms uuid[];
begin
  if auth.uid() is null then raise exception 'sem sessao'; end if;

  select id into v_room from rooms
   where pin = p_pin and closed_at is null and expires_at > now()
   for update;
  if v_room is null then
    return jsonb_build_object('error', 'room_not_found');
  end if;

  -- Captura o escopo antes de alterar left_at. Nenhuma sala de outra sessão
  -- pode entrar nos UPDATEs de transferência/encerramento abaixo.
  select coalesce(array_agg(distinct p.room_id), '{}'::uuid[])
    into v_previous_rooms
    from players p
    join rooms r on r.id = p.room_id
   where p.user_id = auth.uid()
     and p.left_at is null
     and r.closed_at is null
     and p.room_id <> v_room;

  v_join := join_room_internal(p_pin, p_nickname, p_color, p_avatar_seed);
  if v_join ? 'error' then return v_join; end if;

  update players
     set left_at = now()
   where user_id = auth.uid()
     and room_id = any(v_previous_rooms)
     and left_at is null;

  update rooms old_room
     set host_player_id = (
       select p.id from players p
        where p.room_id = old_room.id and p.left_at is null
        order by p.joined_at
        limit 1
     )
   where old_room.id = any(v_previous_rooms)
     and old_room.closed_at is null
     and old_room.host_player_id in (
       select p.id from players p
        where p.user_id = auth.uid()
          and p.room_id = any(v_previous_rooms)
     );

  update matches
     set ended_at = now(), ended_reason = 'abandoned'
   where ended_at is null
     and room_id = any(v_previous_rooms)
     and not exists (
       select 1 from players p
        where p.room_id = matches.room_id and p.left_at is null
     );

  update rooms r
     set closed_at = now(), close_reason = 'empty', host_player_id = null
   where r.id = any(v_previous_rooms)
     and r.closed_at is null
     and not exists (
       select 1 from players p where p.room_id = r.id and p.left_at is null
     );

  return v_join;
end;
$$;

revoke all on function join_room(text, text, text, text) from public, anon;
grant execute on function join_room(text, text, text, text) to authenticated;
