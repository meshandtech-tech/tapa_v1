-- Transições de fase — o coração da correção.
--
-- INVARIANTE: um passo só pode avançar UMA vez, mesmo que os 10 aparelhos
-- percebam a conclusão no mesmo milissegundo.
--
-- Como: `select ... for update` na linha da sala serializa as tentativas, e o
-- compare-and-set em (phase, phase_ends_at) faz o segundo a chegar virar
-- no-op. Antes disso, dois "hosts" simultâneos despachavam ADVANCE cada um —
-- era isso que pulava passo e sorteava o mesmo tema duas vezes.
--
-- O prazo é julgado pelo relógio do POSTGRES. O relógio do celular não decide
-- nada: ele só desenha a contagem.

-- Folga entre o prazo vencer e o passo ser dado por encerrado.
create or replace function submit_grace_ms(p_game text, p_phase text)
returns int language sql immutable as $$
  select case
    when p_game = 'drawing-telephone' and p_phase in ('DRAW_STEP','GUESS_STEP')
      then 3000 else 0 end;
$$;

-- Passo par desenha, ímpar descreve. Espelha `routing.ts`.
create or replace function step_kind(p_step int)
returns text language sql immutable as $$
  select case when p_step % 2 = 0 then 'drawing' else 'guess' end;
$$;

-- Ímpar vira par por baixo: a corrente TEM de terminar num palpite escrito,
-- senão não há frase final para comparar com o tema. Espelha
-- `contributionStepCount`.
create or replace function contribution_step_count(p_players int)
returns int language sql immutable as $$
  select case
    when p_players < 2 then 0
    when p_players % 2 = 0 then p_players
    else p_players - 1 end;
$$;

-- ---------------------------------------------------------------------------
-- Preencher quem não entregou
-- ---------------------------------------------------------------------------
-- Um jogador que não aperta Enviar NÃO pode segurar a mesa. Cada assento sem
-- página no passo corrente ganha uma contribuição `missed`, e a corrente segue
-- estruturalmente válida. Roda dentro da MESMA transação que move a fase, para
-- não existir instante em que o passo avançou e a página não existe.
create or replace function backfill_step(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m       matches%rowtype;
  v_total int;
  v_kind  text;
begin
  select * into m from matches where id = p_match;
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
   -- array_position é base 1; o rodízio é base 0.
   and c.position = (((s.seat - 1 - m.step_index) % v_total) + v_total) % v_total
  on conflict (match_id, step_index, player_id) do nothing;

  update matches set submitted_player_ids = seat_order where id = p_match;
end;
$$;

-- Todo mundo do assento já entregou?
create or replace function all_submitted(p_match uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select m.seat_order <@ m.submitted_player_ids and array_length(m.seat_order,1) > 0
     from matches m where m.id = p_match),
    false);
$$;


-- ---------------------------------------------------------------------------
-- Fatias da roleta de teses
-- ---------------------------------------------------------------------------
-- Espelha `drawCandidates` + `pickWinner` do TS: as fatias são o que RESTA do
-- acervo (no máximo 8), e o vencedor é sorteado entre elas. Decidido UMA vez,
-- aqui, e guardado — senão cada aparelho encenaria um sorteio diferente.
create or replace function draw_topic_candidates(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ids text[];
  v_n   int;
begin
  select array_agg(source || ':' || topic_id order by position)
    into v_ids
    from (select source, topic_id, position from match_topics
           where match_id = p_match and used_at is null and rejected_at is null
           order by position limit 8) as disponiveis;

  v_n := coalesce(array_length(v_ids, 1), 0);
  update matches
     set topic_candidates = coalesce(v_ids, '{}'),
         topic_winner = case when v_n > 0 then floor(random() * v_n)::int else 0 end
   where id = p_match;
end;
$$;

-- ---------------------------------------------------------------------------
-- advance_phase
-- ---------------------------------------------------------------------------
create or replace function advance_phase(
  p_room             uuid,
  p_expected_phase   text default null,
  p_expected_ends_at timestamptz default null,
  -- Host apertando "pular": dispensa o prazo, mas NÃO dispensa o compare-and-set.
  p_force            boolean default false
) returns rooms
language plpgsql security definer set search_path = public as $$
declare
  r          rooms%rowtype;
  m          matches%rowtype;
  v_next     text;
  v_duration int;
  v_players  int;
  v_due      boolean;
  v_ends     timestamptz;
begin
  -- Serializa: os outros nove esperam aqui e saem por no-op logo abaixo.
  select * into r from rooms where id = p_room for update;
  if not found or r.closed_at is not null then return r; end if;

  -- Compare-and-set. Alguém já avançou esta fase: nada a fazer.
  if p_expected_phase is not null and r.phase is distinct from p_expected_phase then
    return r;
  end if;
  if p_expected_ends_at is not null
     and r.phase_ends_at is distinct from p_expected_ends_at then
    return r;
  end if;

  if p_force and not is_host_of(p_room) then
    raise exception 'apenas o host pode forcar o avanco';
  end if;

  select * into m from matches where room_id = p_room and ended_at is null;

  -- Está na hora? Pelo relógio do banco, nunca pelo do aparelho.
  v_due := p_force
        or (r.phase_ends_at is not null
            and r.paused_at is null
            and now() >= r.phase_ends_at
                 + (submit_grace_ms(r.game_id, r.phase) || ' milliseconds')::interval);

  if m.id is not null and r.phase in ('DRAW_STEP','GUESS_STEP') and all_submitted(m.id) then
    v_due := true;
  end if;
  if m.id is not null and r.phase = 'ROUND_ACTIVE'
     and (select count(*) from answers where match_id = m.id and round = r.round)
         >= coalesce(array_length(m.seat_order,1), 0) then
    v_due := true;
  end if;

  if not v_due then return r; end if;

  -- -------------------------------------------------------------------------
  -- Telefone Sem Fio de Desenho
  -- -------------------------------------------------------------------------
  if r.game_id = 'drawing-telephone' and m.id is not null then
    if r.phase = 'GAME_INTRO' then
      update matches set step_index = 0, submitted_player_ids = '{}' where id = m.id;
      v_next := 'DRAW_STEP';

    elsif r.phase in ('DRAW_STEP','GUESS_STEP') then
      -- Quem não entregou vira página em branco AQUI, na mesma transação.
      perform backfill_step(m.id);
      v_next := 'PASSING';

    elsif r.phase = 'PASSING' then
      if m.step_index + 1 >= m.step_count then
        update matches set reveal_chain_index = 0, reveal_page_index = 0 where id = m.id;
        v_next := 'REVEAL_INTRO';
      else
        update matches
           set step_index = m.step_index + 1, submitted_player_ids = '{}'
         where id = m.id;
        v_next := case when step_kind(m.step_index + 1) = 'drawing'
                       then 'DRAW_STEP' else 'GUESS_STEP' end;
        update rooms set round = m.step_index + 2 where id = p_room;
      end if;

    elsif r.phase = 'REVEAL_INTRO' then
      v_next := 'REVEAL_PAGE';

    elsif r.phase = 'REVEAL_PAGE' then
      -- Páginas do caderno: o tema, uma por contribuição, e o confronto final.
      if m.reveal_page_index < m.step_count + 1 then
        update matches set reveal_page_index = m.reveal_page_index + 1 where id = m.id;
        v_next := 'REVEAL_PAGE';
      elsif m.reveal_chain_index + 1
            < (select count(*) from chains where match_id = m.id) then
        update matches
           set reveal_chain_index = m.reveal_chain_index + 1, reveal_page_index = 0
         where id = m.id;
        v_next := 'REVEAL_PAGE';
      else
        perform apply_drawing_scores(m.id);
        update matches set ended_at = now(), ended_reason = 'completed' where id = m.id;
        v_next := 'GAME_OVER';
      end if;
    end if;

  -- -------------------------------------------------------------------------
  -- Advogado do Diabo / Pitch no Escuro — mesmas batidas
  -- -------------------------------------------------------------------------
  elsif r.game_id in ('advogado-do-diabo','improv-slides') and m.id is not null then
    v_players := coalesce(array_length(m.seat_order, 1), 0);

    if r.phase in ('GAME_INTRO','SCORE_REVEAL') then
      if r.phase = 'SCORE_REVEAL' and m.presenter_index >= v_players - 1 then
        update matches set ended_at = now(), ended_reason = 'completed' where id = m.id;
        v_next := 'GAME_OVER';
      elsif r.game_id = 'advogado-do-diabo' then
        perform draw_topic_candidates(m.id);
        v_next := 'TOPIC_SPIN';
      else
        update matches
           set presenter_index = m.presenter_index + 1
         where id = m.id;
        update rooms set round = r.round + 1 where id = p_room;
        v_next := 'PLAYER_SPIN';
      end if;

    elsif r.phase = 'TOPIC_SPIN' then
      -- O tema que a roleta apontou SOME do acervo agora. Se o grupo pedir
      -- outro, este não volta — nem nesta rodada nem nesta partida.
      update match_topics t set used_at = now()
       where t.match_id = m.id
         and t.source || ':' || t.topic_id
             = m.topic_candidates[m.topic_winner + 1];
      v_next := 'TOPIC_REVEAL';

    elsif r.phase = 'TOPIC_REVEAL' then
      -- Só agora a fila anda: o apresentador desta rodada fica definido.
      update matches set presenter_index = m.presenter_index + 1 where id = m.id;
      update rooms set round = r.round + 1 where id = p_room;
      update match_topics set presenter_id = m.seat_order[m.presenter_index + 2]
       where match_id = m.id and used_at is not null and presenter_id is null;
      v_next := 'PLAYER_SPIN';

    elsif r.phase = 'VOTING' then
      perform apply_round_score(m.id, r.round);
      v_next := 'SCORE_REVEAL';

    else
      select next_phase into v_next from phase_config
       where game_id = r.game_id and phase = r.phase;
    end if;

  -- -------------------------------------------------------------------------
  -- Quem Erra, Paga
  -- -------------------------------------------------------------------------
  else
    if r.phase = 'GAME_INTRO' then
      update rooms set round = 1 where id = p_room;
      v_next := 'ROUND_ACTIVE';
    elsif r.phase = 'ROUND_ACTIVE' then
      perform apply_quiz_scores(m.id, r.round);
      v_next := 'REVEAL_ANSWER';
    elsif r.phase = 'REVEAL_ANSWER' then
      v_next := 'LEADERBOARD';
    elsif r.phase = 'LEADERBOARD' then
      if m.id is not null and r.round >= coalesce(array_length(m.question_order,1), 0) then
        update matches set ended_at = now(), ended_reason = 'completed' where id = m.id;
        v_next := 'GAME_OVER';
      else
        update rooms set round = r.round + 1 where id = p_room;
        update matches set punishment_index = null where id = m.id;
        v_next := 'ROUND_ACTIVE';
      end if;
    else
      select next_phase into v_next from phase_config
       where game_id = r.game_id and phase = r.phase;
    end if;
  end if;

  if v_next is null then return r; end if;

  select duration_ms into v_duration from phase_config
   where game_id = r.game_id and phase = v_next;
  v_duration := coalesce(v_duration, 0);

  -- Revelação com auto-play sobrepõe a duração declarada: a MESMA fase espera
  -- o host ou anda sozinha.
  if v_next = 'REVEAL_PAGE' and m.id is not null and m.reveal_autoplay then
    v_duration := 4000;
  end if;

  v_ends := case when v_duration > 0
                 then now() + (v_duration || ' milliseconds')::interval
                 else null end;

  update rooms
     set phase = v_next, phase_ends_at = v_ends, paused_at = null
   where id = p_room
  returning * into r;

  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rede de segurança: fases vencidas sem ninguém olhando
-- ---------------------------------------------------------------------------
-- Existe para o caso de TODOS os celulares estarem em segundo plano. A vida da
-- partida não pode depender de nenhum aparelho estar acordado — era esse o
-- defeito original.
create or replace function close_overdue_phases()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_id    uuid;
  v_count int := 0;
begin
  for v_id in
    select id from rooms
     where closed_at is null
       and paused_at is null
       and phase_ends_at is not null
       and now() >= phase_ends_at + interval '5 seconds'
     limit 200
  loop
    perform advance_phase(v_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
