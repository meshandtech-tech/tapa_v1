-- Proteções para a festa de 60 pessoas.
--
-- Não muda nenhuma regra de jogo. Fecha quatro caminhos de interferência
-- entre salas encontrados com chamadas reais contra produção:
--   1. PIN repetido encerrava a sala que já existia;
--   2. qualquer sessão podia enumerar salas abertas e pedir seu snapshot;
--   3. duas entradas simultâneas podiam furar a capacidade da sala;
--   4. replace_slides não validava a permissão de host.

-- ---------------------------------------------------------------------------
-- Criar sem destruir: colisão escolhe outro PIN de forma atômica.
-- ---------------------------------------------------------------------------
create or replace function create_room(
  p_pin text, p_game_id text default 'quem-erra-paga'
) returns rooms language plpgsql security definer set search_path = public as $$
declare
  r         rooms%rowtype;
  v_pin     text := p_pin;
  v_attempt int;
begin
  if auth.uid() is null then raise exception 'sem sessao'; end if;
  if p_pin !~ '^\d{4}$' then raise exception 'pin invalido'; end if;

  for v_attempt in 0..19 loop
    begin
      insert into rooms (pin, game_id) values (v_pin, p_game_id)
      returning * into r;
      return r;
    exception when unique_violation then
      -- A unique parcial de rooms continua sendo a autoridade. O sorteio só
      -- escolhe o próximo candidato; duas transações nunca ganham o mesmo.
      v_pin := lpad(floor(random() * 10000)::int::text, 4, '0');
    end;
  end loop;

  raise exception 'nao foi possivel reservar um pin';
end;
$$;

-- ---------------------------------------------------------------------------
-- Resolver PIN sem deixar a tabela de salas abertas enumerável.
-- ---------------------------------------------------------------------------
create or replace function resolve_room(p_pin text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_room uuid;
begin
  if auth.uid() is null then return null; end if;
  select id into v_room from rooms where pin = p_pin and closed_at is null;
  return v_room;
end;
$$;

drop policy if exists rooms_select on rooms;
create policy rooms_select on rooms for select to authenticated
  using (is_member_of(id));

revoke all on function resolve_room(text) from public, anon;
grant execute on function resolve_room(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Entrada serializada pela linha da sala.
-- ---------------------------------------------------------------------------
alter function join_room(text, text, text, text) rename to join_room_internal;
revoke all on function join_room_internal(text, text, text, text)
  from public, anon, authenticated;

create function join_room(
  p_pin text, p_nickname text, p_color text, p_avatar_seed text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room uuid;
begin
  if auth.uid() is null then raise exception 'sem sessao'; end if;

  -- O lock fica preso até o fim da chamada interna. Assim a décima primeira
  -- entrada enxerga a contagem já atualizada pela décima.
  select id into v_room from rooms
   where pin = p_pin and closed_at is null
   for update;
  if v_room is null then
    return jsonb_build_object('error', 'room_not_found');
  end if;

  return join_room_internal(p_pin, p_nickname, p_color, p_avatar_seed);
end;
$$;

revoke all on function join_room(text, text, text, text) from public, anon;
grant execute on function join_room(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Snapshot: membro lê a própria sala; espectador sem sala continua funcionando.
-- ---------------------------------------------------------------------------
alter function room_snapshot(uuid) rename to room_snapshot_internal;
revoke all on function room_snapshot_internal(uuid)
  from public, anon, authenticated;

create function room_snapshot(p_room uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'sem_sessao');
  end if;

  -- Uma sessão que já joga em outra sala não pode usar o UUID para espiar.
  -- Uma sessão limpa continua podendo ser a tela grande opcional antes de
  -- entrar; depois que entra, fica restrita à própria sala.
  if not is_member_of(p_room) and exists (
    select 1
      from players p
      join rooms r on r.id = p.room_id
     where p.user_id = auth.uid()
       and p.left_at is null
       and r.closed_at is null
       and p.room_id <> p_room
  ) then
    return jsonb_build_object('error', 'room_forbidden');
  end if;

  return room_snapshot_internal(p_room);
end;
$$;

revoke all on function room_snapshot(uuid) from public, anon;
grant execute on function room_snapshot(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Só membros podem cutucar o relógio; o cron (auth.uid nulo) continua capaz.
-- ---------------------------------------------------------------------------
alter function advance_phase(uuid, text, timestamptz, boolean)
  rename to advance_phase_internal;
revoke all on function advance_phase_internal(uuid, text, timestamptz, boolean)
  from public, anon, authenticated;

create function advance_phase(
  p_room uuid,
  p_expected_phase text default null,
  p_expected_ends_at timestamptz default null,
  p_force boolean default false
) returns rooms language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_member_of(p_room) then
    raise exception 'nao esta na sala';
  end if;
  return advance_phase_internal(
    p_room, p_expected_phase, p_expected_ends_at, p_force
  );
end;
$$;

revoke all on function advance_phase(uuid, text, timestamptz, boolean)
  from public, anon;
grant execute on function advance_phase(uuid, text, timestamptz, boolean)
  to authenticated;

-- O cron resolve o nome no momento da execução; ele chama o wrapper acima com
-- auth.uid nulo e continua sendo a rede de segurança dos prazos.

-- ---------------------------------------------------------------------------
-- Controle de slides também é comando de host.
-- ---------------------------------------------------------------------------
create or replace function replace_slides(p_room uuid, p_slide_ids text[])
returns rooms language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype;
begin
  if not is_host_of(p_room) then raise exception 'apenas o host'; end if;
  select * into r from rooms where id = p_room;
  if r.phase not in ('PLAYER_SPIN','PLAYER_REVEAL') then return r; end if;
  if coalesce(array_length(p_slide_ids, 1), 0) = 0 then return r; end if;

  update matches
     set slide_ids = p_slide_ids,
         used_slide_ids = used_slide_ids || p_slide_ids
   where room_id = p_room and ended_at is null;
  return r;
end;
$$;
