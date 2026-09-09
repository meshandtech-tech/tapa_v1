-- Lifecycle confiável entre salas.
--
-- O bug reproduzido era uma contradição entre duas regras válidas isoladamente:
-- `create_room` abria a sala nova, mas `room_snapshot` recusava qualquer pessoa
-- ainda associada a uma sala antiga. A UI recebia `room_forbidden` e dizia que
-- o host tinha fechado a sala recém-criada. Esta migration:
--   1. permite pré-entrada em qualquer lobby cujo PIN foi resolvido;
--   2. ao entrar, sai atomicamente das outras salas abertas;
--   3. transfere o host antigo ou fecha a sala que ficou vazia;
--   4. registra encerramento/expiração para a UI não precisar adivinhar;
--   5. mantém refresh e troca de rede independentes de presença momentânea.

alter table rooms add column if not exists close_reason text;
alter table rooms add column if not exists expires_at timestamptz;

update rooms
   set expires_at = created_at + interval '24 hours'
 where expires_at is null;

alter table rooms alter column expires_at set default (now() + interval '24 hours');
alter table rooms alter column expires_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rooms_close_reason_check'
  ) then
    alter table rooms add constraint rooms_close_reason_check check (
      close_reason is null or close_reason in ('host_closed', 'empty', 'expired')
    );
  end if;
end;
$$;

create index if not exists rooms_expiry_idx on rooms (expires_at)
  where closed_at is null;

-- Limpa salas cuja criação foi interrompida antes do primeiro join. A janela
-- evita disputar com um cliente que acabou de criar a sala e ainda está no
-- formulário de apelido. Também remove resíduos anteriores ao rollout.
update matches
   set ended_at = now(), ended_reason = 'abandoned'
 where ended_at is null
   and room_id in (
     select r.id from rooms r
      where r.closed_at is null
        and r.created_at < now() - interval '5 minutes'
        and not exists (
          select 1 from players p where p.room_id = r.id and p.left_at is null
        )
   );
update rooms r
   set closed_at = now(), close_reason = 'empty', host_player_id = null
 where r.closed_at is null
   and r.created_at < now() - interval '5 minutes'
   and not exists (
     select 1 from players p where p.room_id = r.id and p.left_at is null
   );

-- Resolve com diagnóstico. A RPC antiga continua disponível para clientes que
-- ainda estejam abertos durante o deploy.
create or replace function resolve_room_state(p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('status', 'auth_error');
  end if;
  if p_pin !~ '^\d{4}$' then
    return jsonb_build_object('status', 'invalid_pin');
  end if;

  -- Expirar é lazy e autoritativo: não depende de pg_cron estar disponível no
  -- plano. Vinte e quatro horas não confundem suspensão de Safari ou troca de
  -- rede com abandono de uma festa real.
  update matches
     set ended_at = now(), ended_reason = 'abandoned'
   where ended_at is null
     and room_id in (
       select id from rooms
        where pin = p_pin and closed_at is null and expires_at <= now()
     );
  update rooms
     set closed_at = now(), close_reason = 'expired'
   where pin = p_pin and closed_at is null and expires_at <= now();

  select * into r
    from rooms
   where pin = p_pin
   order by (closed_at is null) desc, created_at desc
   limit 1;

  if not found then
    return jsonb_build_object('status', 'room_not_found');
  end if;
  if r.closed_at is not null then
    return jsonb_build_object(
      'status', case when r.close_reason = 'expired'
                     then 'room_expired' else 'room_closed' end
    );
  end if;
  return jsonb_build_object('status', 'open', 'room_id', r.id);
end;
$$;

revoke all on function resolve_room_state(text) from public, anon;
grant execute on function resolve_room_state(text) to authenticated;

-- A pessoa precisa ver o roster/configuração antes de enviar o apelido. Em
-- LOBBY, conhecer o PIN é a capacidade de entrada; fora dele, o isolamento
-- entre partidas continua igual ao da 0014.
create or replace function room_snapshot(p_room uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'sem_sessao');
  end if;

  select * into r from rooms where id = p_room;
  if not found then
    return jsonb_build_object('error', 'room_not_found');
  end if;
  if r.closed_at is not null then
    return jsonb_build_object(
      'error', case when r.close_reason = 'expired'
                    then 'room_expired' else 'room_closed' end
    );
  end if;
  if r.expires_at <= now() then
    update matches set ended_at = now(), ended_reason = 'abandoned'
     where room_id = p_room and ended_at is null;
    update rooms set closed_at = now(), close_reason = 'expired'
     where id = p_room;
    return jsonb_build_object('error', 'room_expired');
  end if;

  if r.phase <> 'LOBBY'
     and not is_member_of(p_room)
     and exists (
       select 1
         from players p
         join rooms other_room on other_room.id = p.room_id
        where p.user_id = auth.uid()
          and p.left_at is null
          and other_room.closed_at is null
          and p.room_id <> p_room
     ) then
    return jsonb_build_object('error', 'room_forbidden');
  end if;

  return room_snapshot_internal(p_room);
end;
$$;

-- Entrada serializada + troca de sala numa única transação. Uma falha de
-- apelido/capacidade não remove a pessoa da sala antiga: só limpamos depois do
-- join interno ter confirmado sucesso.
create or replace function join_room(
  p_pin text, p_nickname text, p_color text, p_avatar_seed text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_room  uuid;
  v_join  jsonb;
begin
  if auth.uid() is null then raise exception 'sem sessao'; end if;

  select id into v_room from rooms
   where pin = p_pin and closed_at is null and expires_at > now()
   for update;
  if v_room is null then
    return jsonb_build_object('error', 'room_not_found');
  end if;

  v_join := join_room_internal(p_pin, p_nickname, p_color, p_avatar_seed);
  if v_join ? 'error' then return v_join; end if;

  update players
     set left_at = now()
   where user_id = auth.uid()
     and room_id <> v_room
     and left_at is null;

  -- Se esta pessoa comandava outra sala, o membro ativo mais antigo assume.
  update rooms old_room
     set host_player_id = (
       select p.id from players p
        where p.room_id = old_room.id and p.left_at is null
        order by p.joined_at
        limit 1
     )
   where old_room.id <> v_room
     and old_room.closed_at is null
     and old_room.host_player_id in (
       select p.id from players p
        where p.user_id = auth.uid() and p.room_id <> v_room
     );

  update matches
     set ended_at = now(), ended_reason = 'abandoned'
   where ended_at is null
     and room_id in (
       select r.id from rooms r
        where r.id <> v_room
          and r.closed_at is null
          and not exists (
            select 1 from players p where p.room_id = r.id and p.left_at is null
          )
     );
  update rooms r
     set closed_at = now(), close_reason = 'empty', host_player_id = null
   where r.id <> v_room
     and r.closed_at is null
     and not exists (
       select 1 from players p where p.room_id = r.id and p.left_at is null
     );

  return v_join;
end;
$$;

-- Sair explicitamente devolve a vaga. Se era a última pessoa, também libera o
-- PIN e encerra qualquer match vivo; desaparecer da rede NÃO chama esta RPC.
create or replace function leave_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid;
begin
  v_me := my_player_id(p_room);
  if v_me is null then return; end if;

  update players set left_at = now() where id = v_me;
  update rooms set host_player_id = (
    select id from players
     where room_id = p_room and left_at is null
     order by joined_at limit 1
  ) where id = p_room and host_player_id = v_me;

  if not exists (
    select 1 from players where room_id = p_room and left_at is null
  ) then
    update matches set ended_at = now(), ended_reason = 'abandoned'
     where room_id = p_room and ended_at is null;
    update rooms
       set closed_at = now(), close_reason = 'empty', host_player_id = null
     where id = p_room and closed_at is null;
  end if;
end;
$$;

create or replace function close_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_host_of(p_room) then raise exception 'apenas o host'; end if;
  update matches set ended_at = now(), ended_reason = 'abandoned'
   where room_id = p_room and ended_at is null;
  update rooms set closed_at = now(), close_reason = 'host_closed'
   where id = p_room;
end;
$$;
