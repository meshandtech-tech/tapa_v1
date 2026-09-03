-- Finalização real do desenho.
--
-- Os traços entram primeiro como `pending`: já estão seguros no Postgres,
-- mas não contam como entrega concluída enquanto a imagem está sendo gerada e
-- enviada. `all_submitted` passa a olhar as linhas terminais, e não apenas o
-- array de progresso. Assim todos os uploads rápidos terminam antes da fase;
-- após a folga máxima, `backfill_step` transforma pendências em `failed`,
-- preserva os traços e libera a mesa sem depender de um celular.

create or replace function submit_contribution(
  p_room         uuid,
  p_storage_path text default null,
  p_strokes      jsonb default null,
  p_text         text default '',
  p_status       text default 'submitted'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r        rooms%rowtype;
  m        matches%rowtype;
  v_me     uuid;
  v_seat   int;
  v_total  int;
  v_chain  uuid;
  v_kind   text;
  v_id     uuid;
  v_status text;
begin
  if p_status not in ('submitted', 'timeout', 'failed', 'pending') then
    return jsonb_build_object('skipped', 'invalid_status');
  end if;

  -- Compartilha a trava entre envios simultâneos, mas serializa contra o
  -- FOR UPDATE de advance_phase_internal. Assim um canvas do passo N nunca é
  -- gravado no passo N+1 por cair exatamente na fronteira do relógio.
  select * into r from rooms where id = p_room for share;
  if not found then raise exception 'sala inexistente'; end if;
  v_me := my_player_id(p_room);
  if v_me is null then raise exception 'nao esta na sala'; end if;

  select * into m from matches where room_id = p_room and ended_at is null;
  if not found then raise exception 'sem partida'; end if;

  v_seat := array_position(m.seat_order, v_me);
  if v_seat is null then return jsonb_build_object('skipped', 'not_in_match'); end if;
  if r.phase not in ('DRAW_STEP','GUESS_STEP') then
    return jsonb_build_object('skipped', 'phase_closed');
  end if;

  v_total := array_length(m.seat_order, 1);
  v_kind  := step_kind(m.step_index);
  select id into v_chain from chains
   where match_id = m.id
     and position = (((v_seat - 1 - m.step_index) % v_total) + v_total) % v_total;
  if v_chain is null then raise exception 'caderno nao encontrado'; end if;

  insert into contributions (
    match_id, chain_id, player_id, step_index, kind, storage_path, strokes, text, status
  ) values (
    m.id, v_chain, v_me, m.step_index, v_kind, p_storage_path, p_strokes,
    coalesce(p_text,''), p_status
  )
  on conflict (match_id, step_index, player_id) do update
    set storage_path = coalesce(excluded.storage_path, contributions.storage_path),
        strokes      = coalesce(excluded.strokes, contributions.strokes),
        text         = case when contributions.status in ('missed','pending')
                            then excluded.text else contributions.text end,
        status       = case when contributions.status in ('missed','pending')
                            then excluded.status else contributions.status end,
        updated_at   = now()
    where contributions.status in ('missed','pending')
  returning id, status into v_id, v_status;

  -- `DO UPDATE ... WHERE false` não retorna linha: buscar a existente torna
  -- um reenvio idempotente também no ACK entregue ao frontend.
  if v_id is null then
    select id, status into v_id, v_status
      from contributions
     where match_id = m.id and step_index = m.step_index and player_id = v_me;
  end if;

  if v_status <> 'pending' then
    update matches
       set submitted_player_ids = case
         when v_me = any(submitted_player_ids) then submitted_player_ids
         else submitted_player_ids || v_me
       end
     where id = m.id;
  end if;

  return jsonb_build_object(
    'contribution_id', v_id,
    'chain_id', v_chain,
    'step_index', m.step_index,
    'status', v_status
  );
end;
$$;

create or replace function drawing_terminal_submissions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.game_id = 'drawing-telephone' then
    select coalesce(array_agg(s.player_id order by s.ordinality), '{}'::uuid[])
      into new.submitted_player_ids
      from unnest(new.seat_order) with ordinality as s(player_id, ordinality)
     where exists (
       select 1
         from contributions c
        where c.match_id = new.id
          and c.step_index = new.step_index
          and c.player_id = s.player_id
          and c.status <> 'pending'
     );
  end if;
  return new;
end;
$$;

drop trigger if exists drawing_terminal_submissions_only on matches;
create trigger drawing_terminal_submissions_only
before update of submitted_player_ids on matches
for each row execute function drawing_terminal_submissions();

create or replace function all_submitted(p_match uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select cardinality(m.seat_order) > 0
         and not exists (
           select 1
             from unnest(m.seat_order) as s(player_id)
            where not exists (
              select 1
                from contributions c
               where c.match_id = m.id
                 and c.step_index = m.step_index
                 and c.player_id = s.player_id
                 and c.status <> 'pending'
            )
         )
       from matches m
      where m.id = p_match),
    false
  );
$$;

create or replace function backfill_step(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m       matches%rowtype;
  v_total int;
  v_kind  text;
begin
  select * into m from matches where id = p_match for update;
  if not found then return; end if;

  v_total := coalesce(array_length(m.seat_order, 1), 0);
  if v_total = 0 then return; end if;
  v_kind := step_kind(m.step_index);

  insert into contributions (match_id, chain_id, player_id, step_index, kind, status)
  select
    m.id,
    c.id,
    m.seat_order[s.seat],
    m.step_index,
    v_kind,
    'missed'
  from generate_series(1, v_total) as s(seat)
  join chains c
    on c.match_id = m.id
   and c.position = (((s.seat - 1 - m.step_index) % v_total) + v_total) % v_total
  on conflict (match_id, step_index, player_id) do nothing;

  -- Upload que ultrapassou a folga vira fallback explícito. Os `strokes`
  -- continuam na mesma linha e serão usados no próximo passo/reveal.
  update contributions
     set status = 'failed', updated_at = now()
   where match_id = m.id
     and step_index = m.step_index
     and status = 'pending';

  update matches set submitted_player_ids = seat_order where id = p_match;
end;
$$;

create or replace function finalize_drawing(
  p_room uuid,
  p_step int,
  p_storage_path text default null,
  p_status text default 'submitted'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r rooms%rowtype;
  m matches%rowtype;
  v_me uuid;
  v_status text;
begin
  if p_status not in ('submitted', 'timeout', 'failed') then
    return jsonb_build_object('accepted', false, 'skipped', 'invalid_status');
  end if;

  select * into r from rooms where id = p_room for share;
  if not found then return jsonb_build_object('accepted', false, 'skipped', 'room_missing'); end if;

  v_me := my_player_id(p_room);
  select * into m from matches where room_id = p_room and ended_at is null;
  if v_me is null or m.id is null or not (v_me = any(m.seat_order)) then
    return jsonb_build_object('accepted', false, 'skipped', 'not_in_match');
  end if;

  update contributions
     set storage_path = coalesce(p_storage_path, storage_path),
         status = case
           when status in ('pending', 'missed', 'failed') then p_status
           else status
         end,
         updated_at = now()
   where match_id = m.id
     and step_index = p_step
     and player_id = v_me
     and kind = 'drawing'
  returning status into v_status;

  if v_status is null then
    return jsonb_build_object('accepted', false, 'skipped', 'contribution_missing');
  end if;

  -- Só mexe no progresso do passo atual. Se o upload terminou depois da
  -- folga, a linha antiga ainda pode ganhar a imagem sem contaminar o passo
  -- novo com o player_id anterior.
  if m.step_index = p_step and v_status <> 'pending' then
    update matches
       set submitted_player_ids = case
         when v_me = any(submitted_player_ids) then submitted_player_ids
         else submitted_player_ids || v_me
       end
     where id = m.id;
  end if;

  return jsonb_build_object('accepted', true, 'status', v_status, 'step_index', p_step);
end;
$$;

-- Cliente antigo continua funcionando durante o deploy gradual.
create or replace function attach_drawing(
  p_room uuid, p_step int, p_storage_path text
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform finalize_drawing(p_room, p_step, p_storage_path, 'submitted');
end;
$$;

revoke all on function finalize_drawing(uuid, int, text, text) from public, anon;
grant execute on function finalize_drawing(uuid, int, text, text) to authenticated;
