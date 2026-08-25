-- Ações da sala.
--
-- Tudo aqui é SECURITY DEFINER e as tabelas não aceitam escrita direta: é o
-- que garante que o cliente mande INTENÇÃO ("entreguei"), nunca FATO ("estou
-- no passo 4 do caderno 7"). Quem decide caderno, passo e prazo é o banco.

create or replace function create_room(p_pin text, p_game_id text default 'quem-erra-paga')
returns rooms language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype;
begin
  -- Sala antiga com o mesmo PIN é encerrada: o código é curto e se repete.
  update rooms set closed_at = now() where pin = p_pin and closed_at is null;
  insert into rooms (pin, game_id) values (p_pin, p_game_id) returning * into r;
  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- Entrar / reconectar
-- ---------------------------------------------------------------------------
-- A parte que consertou o bug de "GAME ALREADY STARTED": se este `user_id` já
-- tem cadastro nesta sala, ele VOLTA — em qualquer fase, com apelido, rosto,
-- pontos e assento intactos. Não existe caminho em que um participante da
-- partida seja tratado como estranho.
create or replace function join_room(
  p_pin text, p_nickname text, p_color text, p_avatar_seed text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r        rooms%rowtype;
  pl       players%rowtype;
  v_count  int;
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
    -- Entrada nova. Vale em QUALQUER fase enquanto houver vaga: pertencer à
    -- SALA e participar da PARTIDA corrente são coisas separadas.
    select count(*) into v_count from players where room_id = r.id and left_at is null;
    if v_count >= 10 then
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

  -- Sala sem host ganha um: sem isso ninguém consegue começar o jogo.
  update rooms set host_player_id = pl.id
   where id = r.id and host_player_id is null
  returning * into r;
  if r.id is null then select * into r from rooms where pin = p_pin and closed_at is null; end if;

  return jsonb_build_object('room_id', r.id, 'player_id', pl.id);
end;
$$;

create or replace function touch_presence(p_room uuid)
returns void language sql security definer set search_path = public as $$
  update players set last_seen_at = now()
   where room_id = p_room and user_id = auth.uid();
$$;

create or replace function leave_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid;
begin
  v_me := my_player_id(p_room);
  update players set left_at = now() where id = v_me;
  -- O comando passa para quem entrou primeiro e ainda está.
  update rooms set host_player_id = (
    select id from players
     where room_id = p_room and left_at is null order by joined_at limit 1)
   where id = p_room and host_player_id = v_me;
end;
$$;

create or replace function update_me(
  p_room uuid, p_nickname text default null,
  p_avatar_seed text default null, p_color text default null
) returns void language sql security definer set search_path = public as $$
  update players set
    nickname    = coalesce(nullif(p_nickname,''), nickname),
    avatar_seed = coalesce(nullif(p_avatar_seed,''), avatar_seed),
    color       = coalesce(nullif(p_color,''), color)
  where room_id = p_room and user_id = auth.uid();
$$;

-- Só para sala genuinamente abandonada. NÃO é a tomada de poder silenciosa de
-- 9 segundos que criava duas autoridades brigando.
create or replace function claim_host(p_room uuid)
returns rooms language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype; v_me uuid;
begin
  select * into r from rooms where id = p_room for update;
  v_me := my_player_id(p_room);
  if v_me is null then return r; end if;

  if r.host_player_id is null
     or not exists (select 1 from players
                     where id = r.host_player_id and left_at is null
                       and last_seen_at > now() - interval '30 seconds')
  then
    update rooms set host_player_id = v_me where id = p_room returning * into r;
  end if;
  return r;
end;
$$;

create or replace function set_settings(
  p_room uuid, p_game_id text default null, p_settings jsonb default null
) returns rooms language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype;
begin
  if not is_host_of(p_room) then raise exception 'apenas o host'; end if;
  select * into r from rooms where id = p_room for update;
  -- Trocar de jogo só no lobby; cor da festa a qualquer momento.
  if p_game_id is not null and r.phase <> 'LOBBY' then
    raise exception 'jogo so muda no lobby';
  end if;
  update rooms set
    game_id  = coalesce(p_game_id, game_id),
    settings = coalesce(p_settings, settings)
  where id = p_room returning * into r;
  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- Começar a partida
-- ---------------------------------------------------------------------------
-- O CONTEÚDO (temas, perguntas, slides) vem do TS, que é onde o acervo mora.
-- A ORDEM e os sorteios acontecem aqui, uma vez, na transação — dois aparelhos
-- nunca discordam sobre quem senta onde.
create or replace function start_match(
  p_room           uuid,
  p_prompts        jsonb   default '[]'::jsonb,
  p_topics         jsonb   default '[]'::jsonb,
  p_question_order int[]   default '{}',
  p_correct        int[]   default '{}',
  p_slide_ids      text[]  default '{}'
) returns rooms language plpgsql security definer set search_path = public as $$
declare
  r        rooms%rowtype;
  m        matches%rowtype;
  v_seats  uuid[];
  v_n      int;
  v_next   text;
  v_dur    int;
begin
  if not is_host_of(p_room) then raise exception 'apenas o host'; end if;

  select * into r from rooms where id = p_room for update;
  if r.phase not in ('LOBBY','GAME_OVER') then return r; end if;

  -- Partida nova zera o placar: senão "jogar de novo" começa viciado.
  update players set score = 0 where room_id = p_room and left_at is null;

  select array_agg(id order by random()) into v_seats
    from players where room_id = p_room and left_at is null;
  v_n := coalesce(array_length(v_seats,1), 0);

  update matches set ended_at = now() where room_id = p_room and ended_at is null;

  insert into matches (
    room_id, game_id, seat_order, step_count,
    question_order, correct_options, slide_ids
  ) values (
    p_room, r.game_id, v_seats,
    case when r.game_id = 'drawing-telephone' then contribution_step_count(v_n) else 0 end,
    p_question_order, p_correct, p_slide_ids
  ) returning * into m;

  -- Cadernos: um por assento, cada um com o seu tema secreto.
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

  -- Acervo FINITO de temas, congelado agora. Ele diminui — 10, 9, 8 — em vez
  -- de ser re-sorteado a cada rodada, que era o que fazia a roleta repetir.
  if jsonb_array_length(p_topics) > 0 then
    insert into match_topics (match_id, topic_id, source, text, position)
    select
      m.id,
      t ->> 'id',
      coalesce(t ->> 'source', 'default'),
      t ->> 'text',
      -- Ordem sorteada UMA vez, aqui. Assim "o primeiro ainda não usado" é um
      -- sorteio de verdade — e, ao mesmo tempo, uma escolha determinística que
      -- dez aparelhos pedindo ao mesmo tempo não conseguem duplicar.
      (row_number() over (order by random()) - 1)::int
    from jsonb_array_elements(p_topics) with ordinality as x(t, ord)
    on conflict do nothing;
  end if;

  v_next := 'GAME_INTRO';
  select duration_ms into v_dur from phase_config
   where game_id = r.game_id and phase = v_next;

  update rooms set
    phase = v_next,
    round = 0,
    paused_at = null,
    phase_ends_at = case when coalesce(v_dur,0) > 0
                         then now() + (v_dur || ' milliseconds')::interval else null end
  where id = p_room returning * into r;

  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- Entregar contribuição
-- ---------------------------------------------------------------------------
-- O cliente NÃO escolhe caderno nem passo: os dois saem da aritmética do
-- rodízio sobre `seat_order`. E a unique (match, step, player) faz o segundo
-- envio — dedo duplo, ou o auto-envio do prazo correndo junto com o manual em
-- 00:00.2 — virar uma linha só.
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
begin
  select * into r from rooms where id = p_room;
  if not found then raise exception 'sala inexistente'; end if;
  v_me := my_player_id(p_room);
  if v_me is null then raise exception 'nao esta na sala'; end if;

  select * into m from matches where room_id = p_room and ended_at is null;
  if not found then raise exception 'sem partida'; end if;

  v_seat := array_position(m.seat_order, v_me);
  if v_seat is null then
    -- Entrou depois que a partida começou: está na SALA, entra na próxima.
    return jsonb_build_object('skipped', 'not_in_match');
  end if;

  -- Aceita entrega atrasada dentro da folga: o traço estava pronto, só a rede
  -- demorou. Fora dela a fase já fechou e a página em branco já existe.
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
    -- Só uma linha preenchida por `backfill_step` pode ser melhorada. Entrega
    -- de verdade nunca é sobrescrita: é isso que torna o envio idempotente.
    set storage_path = coalesce(excluded.storage_path, contributions.storage_path),
        strokes      = coalesce(excluded.strokes, contributions.strokes),
        text         = case when contributions.status in ('missed','pending')
                            then excluded.text else contributions.text end,
        status       = case when contributions.status in ('missed','pending')
                            then excluded.status else contributions.status end,
        updated_at   = now()
    where contributions.status in ('missed','pending')
  returning id into v_id;

  update matches
     set submitted_player_ids =
           case when v_me = any(submitted_player_ids) then submitted_player_ids
                else submitted_player_ids || v_me end
   where id = m.id;

  return jsonb_build_object('contribution_id', v_id, 'chain_id', v_chain,
                            'step_index', m.step_index);
end;
$$;

-- Sobe o caminho do Storage DEPOIS, sem correr contra o prazo: a página já
-- existe desde o primeiro instante, e a imagem só a melhora.
create or replace function attach_drawing(
  p_room uuid, p_step int, p_storage_path text
) returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_match uuid;
begin
  v_me := my_player_id(p_room);
  select id into v_match from matches where room_id = p_room and ended_at is null;
  if v_me is null or v_match is null then return; end if;

  update contributions
     set storage_path = p_storage_path,
         status = case when status in ('pending','missed') then 'submitted' else status end,
         updated_at = now()
   where match_id = v_match and step_index = p_step and player_id = v_me;
end;
$$;

-- ---------------------------------------------------------------------------
-- Votos, respostas, revelação
-- ---------------------------------------------------------------------------
create or replace function submit_vote(p_room uuid, p_rating int)
returns void language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype; m matches%rowtype; v_me uuid; v_present uuid;
begin
  select * into r from rooms where id = p_room;
  if r.phase <> 'VOTING' then return; end if;
  v_me := my_player_id(p_room);
  select * into m from matches where room_id = p_room and ended_at is null;
  if v_me is null or m.id is null then return; end if;

  v_present := m.seat_order[m.presenter_index + 1];
  -- Quem apresenta não se avalia.
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
  -- Resposta atrasada não entra: a folga depois do prazo não é tempo extra.
  if r.phase <> 'ROUND_ACTIVE' or now() > r.phase_ends_at then return; end if;
  v_me := my_player_id(p_room);
  select * into m from matches where room_id = p_room and ended_at is null;
  if v_me is null or m.id is null then return; end if;

  insert into answers (match_id, round, player_id, option_index)
  values (m.id, r.round, v_me, p_option)
  on conflict (match_id, round, player_id) do nothing;
end;
$$;

create or replace function count_as_match(p_room uuid, p_chain uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_host_of(p_room) then raise exception 'apenas o host'; end if;
  update chains set counted_as_match = true
   where id = p_chain
     and match_id = (select id from matches where room_id = p_room and ended_at is null);
end;
$$;

create or replace function set_reveal_autoplay(p_room uuid, p_on boolean)
returns rooms language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype;
begin
  if not is_host_of(p_room) then raise exception 'apenas o host'; end if;
  update matches set reveal_autoplay = p_on
   where room_id = p_room and ended_at is null;
  select * into r from rooms where id = p_room;
  -- Ligar o auto-play tem de rearmar a página corrente, senão o slideshow fica
  -- parado esperando um toque que o host acabou de dispensar.
  if r.phase = 'REVEAL_PAGE' then
    update rooms set phase_ends_at =
      case when p_on then now() + interval '4 seconds' else null end
     where id = p_room returning * into r;
  end if;
  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- REROLL TOPIC
-- ---------------------------------------------------------------------------
-- Recusa o TEMA e mantém quem foi sorteado: ninguém é punido por uma tese que
-- a mesa achou pesada demais. O tema recusado sai do acervo desta partida e
-- não pode voltar no mesmo reroll.
create or replace function reroll_topic(p_room uuid)
returns rooms language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype; m matches%rowtype; v_dur int;
begin
  if not is_host_of(p_room) then raise exception 'apenas o host'; end if;

  select * into r from rooms where id = p_room for update;
  if r.phase not in ('TOPIC_REVEAL','PREPARATION') then return r; end if;
  select * into m from matches where room_id = p_room and ended_at is null;
  if m.id is null then return r; end if;

  -- O tema recusado sai do acervo ANTES do novo sorteio: é isso que garante
  -- que o reroll nunca devolva exatamente o mesmo tema.
  update match_topics t set rejected_at = now()
   where t.match_id = m.id
     and t.source || ':' || t.topic_id = m.topic_candidates[m.topic_winner + 1];

  perform draw_topic_candidates(m.id);

  -- Da PREPARATION em diante o apresentador já foi definido; a fila recua para
  -- ele não perder a vez quando o próximo TOPIC_REVEAL incrementar de novo.
  if r.phase <> 'TOPIC_REVEAL' then
    update matches set presenter_index = greatest(-1, m.presenter_index - 1) where id = m.id;
    update rooms set round = greatest(0, r.round - 1) where id = p_room;
  end if;

  select duration_ms into v_dur from phase_config
   where game_id = r.game_id and phase = 'TOPIC_SPIN';

  update rooms set
    phase = 'TOPIC_SPIN', paused_at = null,
    phase_ends_at = now() + (coalesce(v_dur,7000) || ' milliseconds')::interval
  where id = p_room returning * into r;
  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pausa, reinício, encerramento
-- ---------------------------------------------------------------------------
create or replace function pause_room(p_room uuid, p_paused boolean)
returns rooms language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype;
begin
  if not is_host_of(p_room) then raise exception 'apenas o host'; end if;
  select * into r from rooms where id = p_room for update;

  if p_paused then
    if r.paused_at is not null or r.phase_ends_at is null then return r; end if;
    update rooms set paused_at = now() where id = p_room returning * into r;
  else
    if r.paused_at is null then return r; end if;
    -- Empurra o prazo pelo tempo parado: despausar não pode vencer a fase.
    update rooms set
      phase_ends_at = r.phase_ends_at + (now() - r.paused_at),
      paused_at = null
    where id = p_room returning * into r;
  end if;
  return r;
end;
$$;

create or replace function reset_to_lobby(p_room uuid)
returns rooms language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype;
begin
  if not is_host_of(p_room) then raise exception 'apenas o host'; end if;
  update matches set ended_at = now() where room_id = p_room and ended_at is null;
  update players set score = 0 where room_id = p_room;
  update rooms set phase = 'LOBBY', round = 0, phase_ends_at = null, paused_at = null
   where id = p_room returning * into r;
  return r;
end;
$$;

create or replace function close_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_host_of(p_room) then raise exception 'apenas o host'; end if;
  update rooms set closed_at = now() where id = p_room;
end;
$$;
