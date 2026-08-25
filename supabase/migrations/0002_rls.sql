-- Segurança da sala.
--
-- O PIN é a chave da festa: quem tem o PIN entra. O que NÃO pode vazar é o
-- conteúdo dos cadernos antes da revelação — a graça do Telefone Sem Fio é
-- justamente não saber de onde veio o desenho. Antes isso era só uma convenção
-- do cliente (a tela não mostrava); agora é política de banco, então nem um
-- cliente adulterado nem o stream de Realtime entregam a página do vizinho.

alter table rooms         enable row level security;
alter table players       enable row level security;
alter table matches       enable row level security;
alter table chains        enable row level security;
alter table contributions enable row level security;
alter table match_topics  enable row level security;
alter table votes         enable row level security;
alter table answers       enable row level security;
alter table phase_config  enable row level security;

-- ---------------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------------
-- STABLE + SECURITY DEFINER: usadas dentro das próprias políticas, então não
-- podem elas mesmas passar por RLS (recursão infinita).

create or replace function is_member_of(p_room uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from players
    where room_id = p_room and user_id = auth.uid() and left_at is null
  );
$$;

create or replace function my_player_id(p_room uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from players
  where room_id = p_room and user_id = auth.uid() and left_at is null
  limit 1;
$$;

create or replace function is_host_of(p_room uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from rooms r
    where r.id = p_room and r.host_player_id = my_player_id(p_room)
  );
$$;

create or replace function match_room(p_match uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select room_id from matches where id = p_match;
$$;

-- ---------------------------------------------------------------------------
-- Salas
-- ---------------------------------------------------------------------------
-- Sala aberta é legível por qualquer sessão autenticada: é preciso poder achar
-- a sala PELO PIN antes de ser membro dela. O PIN é o segredo, e é curto de
-- propósito — por isso nada sensível mora nesta linha.
create policy rooms_select on rooms for select
  to authenticated using (closed_at is null or is_member_of(id));

-- Criar sala: qualquer um. Alterar: só via RPC (SECURITY DEFINER), nunca
-- direto — é o que impede um cliente de escrever a própria fase e pular passo.
create policy rooms_insert on rooms for insert to authenticated with check (true);

-- ---------------------------------------------------------------------------
-- Jogadores
-- ---------------------------------------------------------------------------
create policy players_select on players for select
  to authenticated using (is_member_of(room_id) or user_id = auth.uid());

create policy players_insert on players for insert
  to authenticated with check (user_id = auth.uid());

-- Cada um mexe só no próprio cadastro (apelido, rosto, presença). Pontuação
-- não entra aqui: é escrita pelas RPCs.
create policy players_update on players for update
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Partida, cadernos, temas
-- ---------------------------------------------------------------------------
create policy matches_select on matches for select
  to authenticated using (is_member_of(room_id));

-- O caderno em si (dono, tema original) só aparece na revelação — ver o tema
-- original antes da hora entrega a piada inteira.
create policy chains_select on chains for select
  to authenticated using (
    is_member_of(match_room(match_id))
    and exists (
      select 1 from rooms r
      where r.id = match_room(chains.match_id)
        and r.phase in ('REVEAL_INTRO','REVEAL_PAGE','GAME_OVER')
    )
  );

create policy match_topics_select on match_topics for select
  to authenticated using (is_member_of(match_room(match_id)));

-- ---------------------------------------------------------------------------
-- Contribuições — o segredo do jogo
-- ---------------------------------------------------------------------------
-- Uma contribuição é visível se, e só se:
--   1. é minha; ou
--   2. é a página IMEDIATAMENTE anterior à que eu tenho de fazer agora
--      (é literalmente o que eu preciso interpretar); ou
--   3. a sala já está na revelação, onde tudo vira público de uma vez.
create or replace function can_see_contribution(
  p_match uuid, p_chain uuid, p_step int, p_player uuid
) returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_room   uuid;
  v_phase  text;
  v_me     uuid;
  v_seats  uuid[];
  v_step   int;
  v_seat   int;
  v_total  int;
  v_mine   int;
begin
  v_room := match_room(p_match);
  if v_room is null then return false; end if;

  v_me := my_player_id(v_room);
  if v_me is null then return false; end if;
  if p_player = v_me then return true; end if;

  select phase into v_phase from rooms where id = v_room;
  if v_phase in ('REVEAL_INTRO','REVEAL_PAGE','GAME_OVER') then return true; end if;

  select seat_order, step_index into v_seats, v_step from matches where id = p_match;
  v_total := coalesce(array_length(v_seats, 1), 0);
  if v_total = 0 then return false; end if;

  -- Só a página do passo anterior interessa, e só a do MEU caderno de agora.
  if p_step <> v_step - 1 then return false; end if;

  v_seat := array_position(v_seats, v_me);
  if v_seat is null then return false; end if;

  -- array_position é base 1; a aritmética do rodízio é base 0.
  v_mine := ((v_seat - 1 - v_step) % v_total + v_total) % v_total;
  return exists (
    select 1 from chains
    where id = p_chain and match_id = p_match and position = v_mine
  );
end;
$$;

create policy contributions_select on contributions for select
  to authenticated using (
    can_see_contribution(match_id, chain_id, step_index, player_id)
  );

-- Escrita só via RPC: a unique (match, step, player) e a checagem de prazo
-- moram lá. Insert direto deixaria o cliente escolher o passo em que entrega.

-- ---------------------------------------------------------------------------
-- Votos e respostas
-- ---------------------------------------------------------------------------
-- Voto alheio é invisível enquanto a votação corre: ver a nota dos outros
-- antes de fechar muda o próprio voto.
create policy votes_select on votes for select
  to authenticated using (
    voter_id = my_player_id(match_room(match_id))
    or exists (
      select 1 from rooms r
      where r.id = match_room(votes.match_id)
        and r.phase in ('SCORE_REVEAL','LEADERBOARD','GAME_OVER')
    )
  );

create policy answers_select on answers for select
  to authenticated using (
    player_id = my_player_id(match_room(match_id))
    or exists (
      select 1 from rooms r
      where r.id = match_room(answers.match_id)
        and r.phase in ('REVEAL_ANSWER','FORFEIT_WHEEL','LEADERBOARD','GAME_OVER')
    )
  );

-- ---------------------------------------------------------------------------
-- Config de fases: leitura pública, escrita nenhuma.
-- ---------------------------------------------------------------------------
create policy phase_config_select on phase_config for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- Só linhas PEQUENAS e não secretas entram no stream: a fase da sala, o
-- progresso da partida e o roster. O conteúdo das contribuições jamais é
-- transmitido — é buscado sob demanda, já filtrado pela política acima.
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table matches;
alter publication supabase_realtime add table players;
