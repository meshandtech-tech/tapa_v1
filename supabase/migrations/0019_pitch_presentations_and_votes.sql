-- Pitch no Escuro: cinco slides por APRESENTAÇÃO, não por partida.
--
-- Antes `start_match` guardava o acervo inteiro em `matches.slide_ids` e o
-- índice do apresentador mudava sem trocar essa coluna. O resultado era a
-- mesma sequência para todo mundo. O acervo agora fica separado; quando o
-- índice avança, um trigger escolhe uma sequência uma única vez e a persiste.
-- Refresh e reconexão apenas releem o resultado já decidido.

alter table matches
  add column if not exists slide_pool_ids text[] not null default '{}';

create or replace function pick_pitch_slides(
  p_pool text[], p_used text[], p_previous text[], p_count int default 5
) returns text[] language sql volatile set search_path = public as $$
  with pool as (
    select id
      from unnest(coalesce(p_pool, '{}'::text[])) with ordinality as x(id, ord)
     where nullif(id, '') is not null
     group by id
  ), ranked as (
    select id,
           case
             when not (id = any(coalesce(p_used, '{}'::text[])))
              and not (id = any(coalesce(p_previous, '{}'::text[]))) then 0
             when not (id = any(coalesce(p_previous, '{}'::text[]))) then 1
             else 2
           end as priority,
           random() as tie
      from pool
  )
  select coalesce(array_agg(id order by priority, tie), '{}'::text[])
    from (
      select id, priority, tie
        from ranked
       order by priority, tie
       limit greatest(0, p_count)
    ) chosen;
$$;

create or replace function pitch_match_slides_trigger()
returns trigger language plpgsql set search_path = public as $$
declare
  v_fresh int;
begin
  if tg_op = 'INSERT' then
    if new.game_id = 'improv-slides' then
      -- `start_match` continua recebendo o acervo no argumento antigo. O
      -- trigger o move para a coluna correta sem abrir incompatibilidade de
      -- deploy com clientes que ainda não conhecem a migration.
      select coalesce(array_agg(id order by first_ord), '{}'::text[])
        into new.slide_pool_ids
        from (
          select id, min(ord) as first_ord
            from unnest(new.slide_ids) with ordinality as x(id, ord)
           where nullif(id, '') is not null
           group by id
        ) unique_pool;
      new.slide_ids := '{}';
      new.used_slide_ids := '{}';
    end if;
    return new;
  end if;

  if new.game_id = 'improv-slides'
     and new.presenter_index is distinct from old.presenter_index
     and new.presenter_index > old.presenter_index then
    select count(*) into v_fresh
      from unnest(new.slide_pool_ids) as x(id)
     where not (id = any(coalesce(old.used_slide_ids, '{}'::text[])));

    new.slide_ids := pick_pitch_slides(
      new.slide_pool_ids, old.used_slide_ids, old.slide_ids, 5
    );
    -- Terminou um ciclo do acervo: começa uma memória nova com a sequência
    -- atual. Assim sempre sobra opção, mas o conjunto anterior continua sendo
    -- a última prioridade e não volta idêntico quando há alternativas.
    new.used_slide_ids := case
      when v_fresh < 5 then new.slide_ids
      else old.used_slide_ids || new.slide_ids
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists pitch_seed_slide_pool on matches;
create trigger pitch_seed_slide_pool
before insert on matches
for each row execute function pitch_match_slides_trigger();

drop trigger if exists pitch_pick_presenter_slides on matches;
create trigger pitch_pick_presenter_slides
before update of presenter_index on matches
for each row execute function pitch_match_slides_trigger();

-- Partidas que já estavam abertas na hora da migration continuam legíveis.
-- O próximo jogo criado pelo app recebe o acervo completo pelo trigger acima.
update matches
   set slide_pool_ids = slide_ids
 where game_id = 'improv-slides'
   and cardinality(slide_pool_ids) = 0
   and cardinality(slide_ids) > 0;

-- -------------------------------------------------------------------------
-- Voto confirmado e serializado com o fechamento da votação.
-- -------------------------------------------------------------------------
create or replace function submit_vote_confirmed(p_room uuid, p_rating int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r rooms%rowtype;
  m matches%rowtype;
  v_me uuid;
  v_present uuid;
  v_id uuid;
begin
  -- Votos podem correr juntos (FOR SHARE), mas `advance_phase_internal`
  -- precisa do FOR UPDATE e espera todos eles terminarem antes de pontuar.
  select * into r from rooms where id = p_room for share;
  if not found then return jsonb_build_object('accepted', false, 'skipped', 'room_missing'); end if;
  if r.phase <> 'VOTING' then
    return jsonb_build_object('accepted', false, 'skipped', 'phase_closed');
  end if;
  if p_rating < 1 or p_rating > 5 then
    return jsonb_build_object('accepted', false, 'skipped', 'invalid_rating');
  end if;

  v_me := my_player_id(p_room);
  select * into m from matches where room_id = p_room and ended_at is null;
  if v_me is null or m.id is null or not (v_me = any(m.seat_order)) then
    return jsonb_build_object('accepted', false, 'skipped', 'not_in_match');
  end if;

  v_present := m.seat_order[m.presenter_index + 1];
  if v_present = v_me then
    return jsonb_build_object('accepted', false, 'skipped', 'presenter');
  end if;

  insert into votes (match_id, round, voter_id, presenter_id, rating)
  values (m.id, r.round, v_me, v_present, p_rating)
  on conflict (match_id, round, voter_id) do nothing
  returning id into v_id;

  return jsonb_build_object(
    'accepted', true,
    'duplicate', v_id is null,
    'round', r.round
  );
end;
$$;

-- Compatibilidade para a versão anterior do site, que chama a RPC `void`.
create or replace function submit_vote(p_room uuid, p_rating int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform submit_vote_confirmed(p_room, p_rating);
end;
$$;

revoke all on function submit_vote_confirmed(uuid, int) from public, anon;
grant execute on function submit_vote_confirmed(uuid, int) to authenticated;
revoke all on function submit_vote(uuid, int) from public, anon;
grant execute on function submit_vote(uuid, int) to authenticated;
