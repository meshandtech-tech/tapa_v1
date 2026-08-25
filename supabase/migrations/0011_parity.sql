-- Paridade entre o caminho local e o da nuvem.
--
-- A migração deixou nove lacunas na fronteira BANCO↔TELA. Nenhum teste pegou,
-- e o motivo é instrutivo: todos os testes falavam com o banco por RPC, e as
-- nove moram justamente onde os testes não olhavam — no que o snapshot deixa
-- de devolver e no que a projeção descarta.
--
-- Esta migração fecha as que são de servidor. É toda aditiva: colunas novas e
-- `create or replace`, nada reescrito.

-- ---------------------------------------------------------------------------
-- Regras de cada jogo, no banco
-- ---------------------------------------------------------------------------
-- `join_room` tinha `10` escrito na mão e `start_match` não checava mínimo
-- nenhum — dava para começar o Telefone Sem Fio com 2 pessoas, sendo que o
-- jogo declara 4. Isto mora no BANCO, e não num argumento da chamada, porque
-- cliente não pode escolher o próprio limite.
create table if not exists game_rules (
  game_id     text primary key,
  min_players int  not null,
  max_players int  not null,
  has_forfeit boolean not null default false
);

insert into game_rules (game_id, min_players, max_players, has_forfeit) values
  ('quem-erra-paga',    2, 10, true),
  ('advogado-do-diabo', 2, 10, false),
  ('drawing-telephone', 4, 10, false),
  ('improv-slides',     2, 10, false)
on conflict (game_id) do update
   set min_players = excluded.min_players,
       max_players = excluded.max_players,
       has_forfeit = excluded.has_forfeit;

alter table game_rules enable row level security;
create policy game_rules_select on game_rules for select to authenticated using (true);

-- Quantas prendas existem no acervo do TS. Sem isto o banco não tem como
-- sortear uma sem o cliente mandar o número — e aí o cliente escolheria.
alter table matches add column if not exists punishment_count int not null default 0;

-- ---------------------------------------------------------------------------
-- Entrar: capacidade vem das regras
-- ---------------------------------------------------------------------------
create or replace function join_room(
  p_pin text, p_nickname text, p_color text, p_avatar_seed text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r        rooms%rowtype;
  pl       players%rowtype;
  v_count  int;
  v_max    int;
begin
  select * into r from rooms where pin = p_pin and closed_at is null;
  if not found then
    return jsonb_build_object('error', 'room_not_found');
  end if;

  select * into pl from players where room_id = r.id and user_id = auth.uid();

  if found then
    -- Reconexão. `left_at` volta a null mesmo se a pessoa tinha saído: quem
    -- volta para a sala continua sendo quem era.
    update players
       set left_at = null, last_seen_at = now(),
           nickname = coalesce(nullif(p_nickname,''), nickname),
           avatar_seed = coalesce(nullif(p_avatar_seed,''), avatar_seed)
     where id = pl.id
    returning * into pl;
  else
    select max_players into v_max from game_rules where game_id = r.game_id;
    v_max := coalesce(v_max, 10);

    select count(*) into v_count from players where room_id = r.id and left_at is null;
    if v_count >= v_max then
      return jsonb_build_object('error', 'room_full');
    end if;
    if exists (select 1 from players
                where room_id = r.id and left_at is null
                  and lower(nickname) = lower(p_nickname)) then
      return jsonb_build_object('error', 'nickname_taken');
    end if;

    insert into players (room_id, nickname, color, avatar_seed)
    values (r.id, p_nickname, p_color, p_avatar_seed)
    returning * into pl;
  end if;

  update rooms set host_player_id = pl.id
   where id = r.id and host_player_id is null
  returning * into r;
  if r.id is null then select * into r from rooms where pin = p_pin and closed_at is null; end if;

  return jsonb_build_object('room_id', r.id, 'player_id', pl.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Começar: recusa abaixo do mínimo, e lembra os slides já usados
-- ---------------------------------------------------------------------------
create or replace function start_match(
  p_room             uuid,
  p_prompts          jsonb   default '[]'::jsonb,
  p_topics           jsonb   default '[]'::jsonb,
  p_question_order   int[]   default '{}',
  p_correct          int[]   default '{}',
  p_slide_ids        text[]  default '{}',
  p_punishment_count int     default 0
) returns rooms language plpgsql security definer set search_path = public as $$
declare
  r        rooms%rowtype;
  m        matches%rowtype;
  v_seats  uuid[];
  v_n      int;
  v_min    int;
  v_next   text;
  v_dur    int;
  v_usados text[];
begin
  if not is_host_of(p_room) then raise exception 'apenas o host'; end if;

  select * into r from rooms where id = p_room for update;
  if r.phase not in ('LOBBY','GAME_OVER') then return r; end if;

  select array_agg(id order by random()) into v_seats
    from players where room_id = p_room and left_at is null;
  v_n := coalesce(array_length(v_seats,1), 0);

  -- Mínimo de gente. O Telefone Sem Fio com 2 pessoas não é uma partida curta,
  -- é uma corrente que não dá a volta.
  select min_players into v_min from game_rules where game_id = r.game_id;
  if v_n < coalesce(v_min, 2) then
    raise exception 'jogadores insuficientes: % (minimo %)', v_n, coalesce(v_min, 2);
  end if;

  update players set score = 0 where room_id = p_room and left_at is null;

  -- Memória curta do que já saiu, para o acervo de slides dar variedade entre
  -- uma partida e a seguinte. A coluna existia e nada escrevia nela.
  select used_slide_ids into v_usados from matches
   where room_id = p_room order by started_at desc limit 1;

  update matches set ended_at = now(), ended_reason = 'replaced'
   where room_id = p_room and ended_at is null;

  insert into matches (
    room_id, game_id, seat_order, step_count,
    question_order, correct_options, slide_ids, used_slide_ids, punishment_count
  ) values (
    p_room, r.game_id, v_seats,
    case when r.game_id = 'drawing-telephone' then contribution_step_count(v_n) else 0 end,
    p_question_order, p_correct, p_slide_ids,
    coalesce(v_usados, '{}') || p_slide_ids,
    p_punishment_count
  ) returning * into m;

  if r.game_id = 'drawing-telephone' then
    insert into chains (match_id, owner_player_id, position, prompt_id,
                        original_prompt, accepted_answers)
    select
      m.id, v_seats[i], i - 1,
      coalesce(p_prompts -> (i-1) ->> 'id', ''),
      coalesce(p_prompts -> (i-1) ->> 'text', ''),
      coalesce(
        (select array_agg(value #>> '{}')
           from jsonb_array_elements(p_prompts -> (i-1) -> 'acceptedAnswers')),
        '{}')
    from generate_series(1, v_n) as g(i);
  end if;

  if jsonb_array_length(p_topics) > 0 then
    insert into match_topics (match_id, topic_id, source, text, position)
    select
      m.id, t ->> 'id', coalesce(t ->> 'source', 'default'), t ->> 'text',
      (row_number() over (order by random()) - 1)::int
    from jsonb_array_elements(p_topics) with ordinality as x(t, ord)
    on conflict do nothing;
  end if;

  v_next := 'GAME_INTRO';
  select duration_ms into v_dur from phase_config
   where game_id = r.game_id and phase = v_next;

  update rooms set
    phase = v_next, round = 0, paused_at = null,
    phase_ends_at = case when coalesce(v_dur,0) > 0
                         then now() + (v_dur || ' milliseconds')::interval else null end
  where id = p_room returning * into r;

  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- A roleta de prendas de volta
-- ---------------------------------------------------------------------------
-- O jogo se chama "Quem Erra, PAGA", e no caminho da nuvem ninguém pagava:
-- `advance_phase` ia de REVEAL_ANSWER direto para LEADERBOARD, e
-- `punishment_index` só era zerado, nunca sorteado. Regressão da migração.
create or replace function advance_phase(
  p_room             uuid,
  p_expected_phase   text default null,
  p_expected_ends_at timestamptz default null,
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
  v_forfeit  boolean;
  v_errou    int;
begin
  select * into r from rooms where id = p_room for update;
  if not found or r.closed_at is not null then return r; end if;

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

  if r.game_id = 'drawing-telephone' and m.id is not null then
    if r.phase = 'GAME_INTRO' then
      update matches set step_index = 0, submitted_player_ids = '{}' where id = m.id;
      v_next := 'DRAW_STEP';

    elsif r.phase in ('DRAW_STEP','GUESS_STEP') then
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
        update matches set presenter_index = m.presenter_index + 1 where id = m.id;
        update rooms set round = r.round + 1 where id = p_room;
        v_next := 'PLAYER_SPIN';
      end if;

    elsif r.phase = 'TOPIC_SPIN' then
      update match_topics t set used_at = now()
       where t.match_id = m.id
         and t.source || ':' || t.topic_id = m.topic_candidates[m.topic_winner + 1];
      v_next := 'TOPIC_REVEAL';

    elsif r.phase = 'TOPIC_REVEAL' then
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

  else
    if r.phase = 'GAME_INTRO' then
      update rooms set round = 1 where id = p_room;
      v_next := 'ROUND_ACTIVE';

    elsif r.phase = 'ROUND_ACTIVE' then
      perform apply_quiz_scores(m.id, r.round);
      v_next := 'REVEAL_ANSWER';

    elsif r.phase = 'REVEAL_ANSWER' then
      select has_forfeit into v_forfeit from game_rules where game_id = r.game_id;

      -- Quem não respondeu conta como erro — mesma regra do `roundOutcome`
      -- (`quemErraPaga.ts:41`), senão a prenda dependeria de quem foi rápido.
      -- Gabarito `-1` é a pegadinha: aí todo mundo erra.
      select count(*) into v_errou
        from players p
       where p.room_id = p_room and p.left_at is null
         and not exists (
           select 1 from answers a
            where a.match_id = m.id and a.round = r.round and a.player_id = p.id
              and a.option_index = m.correct_options[r.round]
              and m.correct_options[r.round] >= 0);

      if coalesce(v_forfeit, false) and v_errou > 0 and m.punishment_count > 0 then
        update matches
           set punishment_index = floor(random() * m.punishment_count)::int
         where id = m.id;
        v_next := 'FORFEIT_WHEEL';
      else
        v_next := 'LEADERBOARD';
      end if;

    elsif r.phase = 'FORFEIT_WHEEL' then
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

-- Ninguém topou a prenda: sorteia outra sem sair da roleta. Válvula de escape
-- que já existia no reducer local (`partyReducer.ts:757`).
create or replace function reroll_punishment(p_room uuid)
returns rooms language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype; m matches%rowtype; v_nova int;
begin
  if not is_host_of(p_room) then raise exception 'apenas o host'; end if;
  select * into r from rooms where id = p_room;
  if r.phase <> 'FORFEIT_WHEEL' then return r; end if;

  select * into m from matches where room_id = p_room and ended_at is null;
  if m.id is null or m.punishment_count <= 0 then return r; end if;

  -- Outra, de verdade: sortear de novo podia devolver a mesma e o grupo veria
  -- a roleta girar para nada.
  if m.punishment_count = 1 then
    v_nova := 0;
  else
    v_nova := floor(random() * (m.punishment_count - 1))::int;
    if v_nova >= coalesce(m.punishment_index, -1) then v_nova := v_nova + 1; end if;
  end if;

  update matches set punishment_index = v_nova where id = m.id;
  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trocar slide que não carregou
-- ---------------------------------------------------------------------------
-- Mesma janela do reducer local (`partyReducer.ts:924`): só antes de alguém
-- apresentar. Descobrir um arquivo quebrado no meio da apresentação é
-- exatamente o que o pré-carregamento existe para evitar.
create or replace function replace_slides(p_room uuid, p_slide_ids text[])
returns rooms language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype;
begin
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

-- ---------------------------------------------------------------------------
-- O snapshot devolvendo votos, respostas e notas
-- ---------------------------------------------------------------------------
-- Sem isto, dois jogos ficavam com a tela CEGA: o host via "faltam 7 votos"
-- para sempre mesmo com todo mundo tendo votado, e a revelação do quiz dizia
-- que ninguém acertou. Os dados estavam no banco o tempo todo — só não
-- chegavam na tela.
--
-- O segredo continua decidido AQUI: durante a votação, a nota alheia não sai.
create or replace function room_snapshot(p_room uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r         rooms%rowtype;
  m         matches%rowtype;
  v_me      uuid;
  v_seat    int;
  v_total   int;
  v_prev    jsonb := null;
  v_mine    jsonb := null;
  v_reveal  boolean;
  v_votos   jsonb;
  v_notas   jsonb;
  v_resp    jsonb;
begin
  select * into r from rooms where id = p_room;
  if not found then return jsonb_build_object('error','room_not_found'); end if;

  v_me := my_player_id(p_room);

  select * into m from matches where room_id = p_room and ended_at is null;
  -- Sem partida viva: a sala está em GAME_OVER. Mostrar a última é o que faz a
  -- revelação e o placar final existirem.
  if not found then
    select * into m from matches where room_id = p_room
     order by started_at desc limit 1;
  end if;

  v_reveal := r.phase in ('REVEAL_INTRO','REVEAL_PAGE','GAME_OVER');

  if m.id is not null and v_me is not null
     and r.phase in ('DRAW_STEP','GUESS_STEP') then
    v_seat  := array_position(m.seat_order, v_me);
    v_total := array_length(m.seat_order, 1);

    if v_seat is not null and v_total > 0 then
      with meu as (
        select c.* from chains c
         where c.match_id = m.id
           and c.position = (((v_seat - 1 - m.step_index) % v_total) + v_total) % v_total
      )
      select jsonb_build_object(
        'chainId',   meu.id,
        'stepIndex', m.step_index,
        'prompt',    case when m.step_index = 0 then meu.original_prompt else null end,
        'previous',  case when m.step_index = 0 then null else
          (select jsonb_build_object(
              'kind', co.kind, 'text', co.text,
              'storagePath', co.storage_path, 'strokes', co.strokes,
              'status', co.status)
             from contributions co
            where co.chain_id = meu.id and co.step_index = m.step_index - 1)
        end
      ) into v_mine from meu;
    end if;
  end if;

  if m.id is not null and v_me is not null then
    v_prev := to_jsonb(v_me = any(m.submitted_player_ids));
  end if;

  -- VOTOS. Durante a votação sai QUEM votou, com a nota só de quem está
  -- perguntando — é o suficiente para o contador do host e não entrega a nota
  -- de ninguém antes da hora. De SCORE_REVEAL em diante, tudo.
  v_votos := case when m.id is null then '{}'::jsonb else coalesce((
    select jsonb_object_agg(
             v.voter_id::text,
             case when r.phase = 'VOTING' and v.voter_id is distinct from v_me
                  then 0 else v.rating end)
      from votes v where v.match_id = m.id and v.round = r.round), '{}'::jsonb) end;

  -- NOTAS por apresentador. Cada um apresenta uma vez, então a média da rodada
  -- dele é a nota dele.
  v_notas := case when m.id is null then '{}'::jsonb else coalesce((
    select jsonb_object_agg(x.presenter_id::text, x.media) from (
      select presenter_id, round(avg(rating) * 10) / 10 as media
        from votes where match_id = m.id and presenter_id is not null
       group by presenter_id) x), '{}'::jsonb) end;

  -- RESPOSTAS. Durante a rodada saem as CHAVES de todo mundo que respondeu
  -- (é o contador ao vivo da TV), mas o valor alheio vem `-1`. Só a partir de
  -- REVEAL_ANSWER as alternativas de verdade aparecem — antes disso, ver o que
  -- o vizinho marcou mudaria a própria resposta.
  v_resp := case when m.id is null then '{}'::jsonb else coalesce((
    select jsonb_object_agg(
             a.player_id::text,
             case when r.phase = 'ROUND_ACTIVE' and a.player_id is distinct from v_me
                  then -1 else a.option_index end)
      from answers a where a.match_id = m.id and a.round = r.round), '{}'::jsonb) end;

  return jsonb_build_object(
    'room', jsonb_build_object(
      'id', r.id, 'pin', r.pin, 'gameId', r.game_id, 'phase', r.phase,
      'phaseEndsAt', r.phase_ends_at, 'pausedAt', r.paused_at,
      'round', r.round, 'settings', r.settings,
      'hostPlayerId', r.host_player_id, 'closedAt', r.closed_at),

    'me', jsonb_build_object('playerId', v_me, 'submitted', coalesce(v_prev, 'false'::jsonb)),

    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'nickname', p.nickname, 'color', p.color,
        'avatarSeed', p.avatar_seed, 'score', p.score,
        'joinedAt', p.joined_at, 'lastSeenAt', p.last_seen_at)
        order by p.joined_at)
        from players p where p.room_id = p_room and p.left_at is null), '[]'::jsonb),

    'match', case when m.id is null then null else jsonb_build_object(
      'id', m.id, 'gameId', m.game_id, 'seatOrder', to_jsonb(m.seat_order),
      'stepIndex', m.step_index, 'stepCount', m.step_count,
      'submittedPlayerIds', to_jsonb(m.submitted_player_ids),
      'presenterIndex', m.presenter_index,
      'revealChainIndex', m.reveal_chain_index,
      'revealPageIndex', m.reveal_page_index,
      'revealAutoplay', m.reveal_autoplay,
      'questionOrder', to_jsonb(m.question_order),
      'slideIds', to_jsonb(m.slide_ids),
      'usedSlideIds', to_jsonb(m.used_slide_ids),
      'punishmentIndex', m.punishment_index,
      'topicCandidates', to_jsonb(m.topic_candidates),
      'topicWinner', m.topic_winner) end,

    'assignment', v_mine,
    'votes',   v_votos,
    'scores',  v_notas,
    'answers', v_resp,

    'topics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.topic_id, 'source', t.source, 'text', t.text,
        'position', t.position, 'usedAt', t.used_at, 'rejectedAt', t.rejected_at,
        'presenterId', t.presenter_id) order by t.position)
        from match_topics t where t.match_id = m.id), '[]'::jsonb),

    'chains', case when not v_reveal or m.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'ownerPlayerId', c.owner_player_id, 'position', c.position,
        'originalPrompt', c.original_prompt, 'countedAsMatch', c.counted_as_match,
        'acceptedAnswers', to_jsonb(c.accepted_answers),
        'pages', coalesce((
          select jsonb_agg(jsonb_build_object(
            'stepIndex', co.step_index, 'kind', co.kind, 'playerId', co.player_id,
            'storagePath', co.storage_path, 'strokes', co.strokes,
            'text', co.text, 'status', co.status) order by co.step_index)
            from contributions co where co.chain_id = c.id), '[]'::jsonb))
        order by c.position)
        from chains c where c.match_id = m.id), '[]'::jsonb) end,

    'serverTime', to_jsonb(now())
  );
end;
$$;
