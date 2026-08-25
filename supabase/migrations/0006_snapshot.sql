-- A leitura única da sala.
--
-- Um round-trip devolve TUDO o que este jogador pode ver, já filtrado pelo
-- servidor. É o que o cliente chama ao montar e depois de cada reconexão —
-- e é por isso que reconectar deixou de ser um problema: não há estado local
-- a reconstruir, só uma foto a pedir de novo.
--
-- Repare no que NÃO volta: o caderno dos outros, os traços alheios, o voto de
-- quem ainda está votando. Segredo é decidido aqui, não na tela.

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
  v_result  jsonb;
begin
  select * into r from rooms where id = p_room;
  if not found then return jsonb_build_object('error','room_not_found'); end if;

  v_me := my_player_id(p_room);
  select * into m from matches where room_id = p_room and ended_at is null;
  v_reveal := r.phase in ('REVEAL_INTRO','REVEAL_PAGE','GAME_OVER');

  -- A página anterior: a ÚNICA coisa que esta pessoa pode ver durante o jogo.
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
        -- No passo 0 a pessoa desenha o próprio tema secreto.
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

  -- Já entreguei este passo? A tela de espera depende disso.
  if m.id is not null and v_me is not null then
    v_prev := to_jsonb(v_me = any(m.submitted_player_ids));
  end if;

  v_result := jsonb_build_object(
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
      'punishmentIndex', m.punishment_index,
      'topicCandidates', to_jsonb(m.topic_candidates),
      'topicWinner', m.topic_winner) end,

    'assignment', v_mine,

    -- Acervo de temas: o que sobrou, na ordem, com id E origem. O cliente
    -- desenha a roleta a partir DISTO, então fatia e tema nunca divergem.
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.topic_id, 'source', t.source, 'text', t.text,
        'position', t.position, 'usedAt', t.used_at, 'rejectedAt', t.rejected_at,
        'presenterId', t.presenter_id) order by t.position)
        from match_topics t where t.match_id = m.id), '[]'::jsonb),

    -- Cadernos completos só na revelação — antes disso entregaria a piada.
    'chains', case when not v_reveal or m.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'ownerPlayerId', c.owner_player_id, 'position', c.position,
        'originalPrompt', c.original_prompt, 'countedAsMatch', c.counted_as_match,
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

  return v_result;
end;
$$;
