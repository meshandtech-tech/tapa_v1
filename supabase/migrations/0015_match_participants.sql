-- Quem entra no meio pertence à sala, mas só joga a próxima partida.
--
-- `matches.seat_order` é a lista congelada no START_GAME. As ações abaixo
-- antes aceitavam qualquer membro ativo da sala: um recém-chegado conseguia
-- responder ou votar numa partida em que não tinha assento. Reconexão não é
-- afetada, porque preserva o mesmo player_id que já está em seat_order.

create or replace function submit_vote(p_room uuid, p_rating int)
returns void language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype; m matches%rowtype; v_me uuid; v_present uuid;
begin
  select * into r from rooms where id = p_room;
  if r.phase <> 'VOTING' or p_rating < 1 or p_rating > 5 then return; end if;

  v_me := my_player_id(p_room);
  select * into m from matches where room_id = p_room and ended_at is null;
  if v_me is null or m.id is null or not (v_me = any(m.seat_order)) then return; end if;

  v_present := m.seat_order[m.presenter_index + 1];
  if v_present = v_me then return; end if;

  insert into votes (match_id, round, voter_id, presenter_id, rating)
  values (m.id, r.round, v_me, v_present, p_rating)
  on conflict (match_id, round, voter_id) do nothing;
end;
$$;

create or replace function submit_answer(p_room uuid, p_option int)
returns void language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype; m matches%rowtype; v_me uuid;
begin
  select * into r from rooms where id = p_room;
  if r.phase <> 'ROUND_ACTIVE' or now() > r.phase_ends_at
     or p_option < 0 or p_option > 3 then return; end if;

  v_me := my_player_id(p_room);
  select * into m from matches where room_id = p_room and ended_at is null;
  if v_me is null or m.id is null or not (v_me = any(m.seat_order)) then return; end if;

  insert into answers (match_id, round, player_id, option_index)
  values (m.id, r.round, v_me, p_option)
  on conflict (match_id, round, player_id) do nothing;
end;
$$;

revoke all on function submit_vote(uuid, int) from public, anon;
grant execute on function submit_vote(uuid, int) to authenticated;
revoke all on function submit_answer(uuid, int) from public, anon;
grant execute on function submit_answer(uuid, int) to authenticated;
