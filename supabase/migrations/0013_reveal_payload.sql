-- A revelação estava mandando o desenho DUAS vezes.
--
-- Medido no teste ao vivo de 10 jogadores: `room_snapshot` chega a 545,7 kB na
-- revelação. Fora dela a foto é pequena (os cadernos vêm vazios, que é o
-- segredo do jogo), mas em REVEAL_PAGE ela carrega os 10 cadernos inteiros —
-- e cada página vai com a imagem (`storage_path`) E os traços (`strokes`).
--
-- O cliente nunca usa os dois. `DrawingReplay` decide assim:
--
--     const strokes = page.url ? null : parseStrokes(page.strokes);
--
-- Havendo imagem, os traços são descartados sem nem serem lidos. Eles existem
-- para o caso em que o upload NÃO foi — rede ruim, Storage fora — e aí são o
-- que impede a corrente de virar folha em branco. São um plano B, e plano B
-- não precisa viajar junto com o plano A.
--
-- O peso importa porque `useCloudRoom` rebusca a foto a cada aviso de
-- Realtime, e na revelação cada virada de página mexe em `matches`: com 10
-- cadernos são ~120 viradas, cada uma fazendo os 10 aparelhos rebuscarem tudo
-- de novo. No 5G da mesa isso é dinheiro e é lentidão.
--
-- A mudança é uma linha: se a imagem existe, os traços não vão. Se não existe,
-- vão como sempre foram. Nenhuma página fica sem como ser desenhada.

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
              'storagePath', co.storage_path,
              -- Mesma regra da revelação: havendo imagem, os traços ficam.
              'strokes', case when co.storage_path is null then co.strokes else null end,
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

  v_votos := case when m.id is null then '{}'::jsonb else coalesce((
    select jsonb_object_agg(
             v.voter_id::text,
             case when r.phase = 'VOTING' and v.voter_id is distinct from v_me
                  then 0 else v.rating end)
      from votes v where v.match_id = m.id and v.round = r.round), '{}'::jsonb) end;

  v_notas := case when m.id is null then '{}'::jsonb else coalesce((
    select jsonb_object_agg(x.presenter_id::text, x.media) from (
      select presenter_id, round(avg(rating) * 10) / 10 as media
        from votes where match_id = m.id and presenter_id is not null
       group by presenter_id) x), '{}'::jsonb) end;

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
            'storagePath', co.storage_path,
            -- AQUI. Tendo imagem, os traços não vão: o cliente os ignoraria.
            'strokes', case when co.storage_path is null then co.strokes else null end,
            'text', co.text, 'status', co.status) order by co.step_index)
            from contributions co where co.chain_id = c.id), '[]'::jsonb))
        order by c.position)
        from chains c where c.match_id = m.id), '[]'::jsonb) end,

    'serverTime', to_jsonb(now())
  );
end;
$$;
