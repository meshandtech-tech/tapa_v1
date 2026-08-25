-- Pontuação.
--
-- Mora no banco porque o placar não pode depender da palavra de um cliente.
-- A comparação de respostas espelha `matching.ts` — mesma normalização, mesma
-- lista de enfeites. Se um dia divergirem, o teste de paridade em
-- `matching.test.ts` acusa.

create extension if not exists unaccent;

-- Minúscula, sem acento, sem pontuação, sem espaço sobrando.
create or replace function normalize_answer(p_text text)
returns text language sql immutable as $$
  select trim(regexp_replace(
    regexp_replace(lower(unaccent(coalesce(p_text,''))), '[^a-z0-9]+', ' ', 'g'),
    '\s+', ' ', 'g'));
$$;

-- A mesma frase sem artigo e preposição: faz "um cachorro pilotando uma moto"
-- bater com "cachorro pilotando moto", que é a mesma resposta dita por duas
-- pessoas diferentes.
create or replace function loose_answer(p_text text)
returns text language plpgsql immutable as $$
declare
  v_norm  text := normalize_answer(p_text);
  v_words text[];
  v_kept  text[];
begin
  if v_norm = '' then return ''; end if;
  v_words := string_to_array(v_norm, ' ');
  select array_agg(w) into v_kept from unnest(v_words) as w
   where w <> '' and w not in (
     'o','a','os','as','um','uma','uns','umas','de','do','da','dos','das',
     'em','no','na','nos','nas','ao','aos','e');
  -- Frase que era só enfeite volta inteira: melhor comparar demais que virar "".
  if v_kept is null or array_length(v_kept,1) is null then return v_norm; end if;
  return array_to_string(v_kept, ' ');
end;
$$;

create or replace function answers_match(
  p_guess text, p_prompt text, p_accepted text[]
) returns boolean language plpgsql immutable as $$
declare
  v_guess text := normalize_answer(p_guess);
  v_target text;
begin
  if v_guess = '' then return false; end if;
  foreach v_target in array (array[p_prompt] || coalesce(p_accepted, '{}')) loop
    if normalize_answer(v_target) = '' then continue; end if;
    if v_guess = normalize_answer(v_target)
       or loose_answer(p_guess) = loose_answer(v_target) then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Telefone Sem Fio: um ponto por caderno cuja palavra chegou inteira.
-- ---------------------------------------------------------------------------
-- Recalculado dos cadernos, nunca somado ao longo da revelação: rever uma
-- página, ou o host validar um palpite na mão, não pontua duas vezes.
create or replace function apply_drawing_scores(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  with final_guess as (
    select distinct on (c.id)
      c.id as chain_id, c.owner_player_id, c.original_prompt,
      c.accepted_answers, c.counted_as_match, co.text as guess
    from chains c
    left join contributions co
      on co.chain_id = c.id and co.kind = 'guess'
    where c.match_id = p_match
    order by c.id, co.step_index desc
  ),
  survived as (
    select owner_player_id
    from final_guess
    where counted_as_match
       or answers_match(guess, original_prompt, accepted_answers)
  )
  update players p
     set score = (select count(*) from survived s where s.owner_player_id = p.id)
   where p.room_id = (select room_id from matches where id = p_match);
end;
$$;

-- ---------------------------------------------------------------------------
-- Advogado do Diabo / Pitch no Escuro: média das notas da rodada.
-- ---------------------------------------------------------------------------
create or replace function apply_round_score(p_match uuid, p_round int)
returns void language plpgsql security definer set search_path = public as $$
declare
  m         matches%rowtype;
  v_present uuid;
  v_avg     numeric;
begin
  select * into m from matches where id = p_match;
  if not found or m.presenter_index < 0 then return; end if;

  v_present := m.seat_order[m.presenter_index + 1];
  if v_present is null then return; end if;

  select round(avg(rating) * 10) / 10 into v_avg
    from votes where match_id = p_match and round = p_round;
  if v_avg is null then return; end if;

  update players set score = score + round(v_avg) where id = v_present;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quem Erra, Paga: +1 por acerto.
-- ---------------------------------------------------------------------------
create or replace function apply_quiz_scores(p_match uuid, p_round int)
returns void language plpgsql security definer set search_path = public as $$
declare
  m       matches%rowtype;
  v_right int;
begin
  select * into m from matches where id = p_match;
  if not found then return; end if;

  -- `round` é base 1; o gabarito é base 0.
  v_right := m.correct_options[p_round];
  -- `-1` é a pegadinha: nenhuma alternativa está certa, ninguém pontua.
  if v_right is null or v_right < 0 then return; end if;

  update players p set score = p.score + 1
   where p.id in (
     select a.player_id from answers a
      where a.match_id = p_match and a.round = p_round and a.option_index = v_right
   );
end;
$$;
