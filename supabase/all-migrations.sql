-- Tapa — todas as migrations, na ordem.
-- Gerado a partir de supabase/migrations/. NAO edite este arquivo:
-- edite os originais e gere de novo (node scripts/build-migrations.mjs).
--
-- O 0007 (pg_cron) fica de FORA de propósito: ele pode falhar conforme
-- o plano, e é o único opcional. Rode-o depois, separado.
--
-- ATENÇÃO: isto é para banco NOVO. Começa com `create table` sem
-- `if not exists`, então num banco que já existe ele falha na primeira
-- tabela e nada depois roda. Para atualizar um banco vivo, rode só a
-- migration nova, sozinha.


-- ===================================================================
-- 0001_schema.sql
-- ===================================================================
-- Tapa — estado autoritativo da partida no Postgres.
--
-- A regra que este esquema existe para garantir: o CELULAR DO HOST NÃO É O
-- SERVIDOR. Antes a partida inteira morava num `useReducer` de um aparelho e
-- era retransmitida por INTEIRO a cada mudança e a cada 3s; com 10 jogadores
-- isso passava do limite de payload do Realtime no terceiro passo e derrubava
-- a sala.
--
-- Aqui a partida é linha de banco. O host é uma PERMISSÃO
-- (`rooms.host_player_id`), não um processo. Qualquer aparelho pode cair a
-- qualquer momento sem levar a festa junto.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Sala
-- ---------------------------------------------------------------------------
create table rooms (
  id             uuid primary key default gen_random_uuid(),
  pin            text not null,
  host_player_id uuid,
  game_id        text not null default 'quem-erra-paga',
  phase          text not null default 'LOBBY',
  -- Instante absoluto em que a fase vence. O cliente NUNCA transmite contagem:
  -- lê este carimbo e desenha os segundos sozinho.
  phase_ends_at  timestamptz,
  paused_at      timestamptz,
  round          int  not null default 0,
  settings       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  closed_at      timestamptz
);

-- PIN só precisa ser único entre salas ABERTAS: reaproveitar o código de uma
-- festa encerrada é normal e não deveria dar conflito.
create unique index rooms_pin_open_idx on rooms (pin) where closed_at is null;
create index rooms_overdue_idx on rooms (phase_ends_at)
  where closed_at is null and paused_at is null and phase_ends_at is not null;

-- ---------------------------------------------------------------------------
-- Jogador
-- ---------------------------------------------------------------------------
-- `user_id` é o uid da sessão anônima do Supabase. É ELE que sobrevive ao F5,
-- à troca de rede e ao celular bloqueando — a identidade que faltava e que
-- trancava a pessoa para fora da própria partida.
create table players (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references rooms(id) on delete cascade,
  user_id      uuid not null default auth.uid(),
  nickname     text not null,
  color        text not null,
  avatar_seed  text not null,
  score        int  not null default 0,
  joined_at    timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Saiu de verdade (apertou sair), não "sumiu a rede". Quem só caiu continua
  -- no roster e volta para o lugar de onde saiu.
  left_at      timestamptz
);

create unique index players_room_user_idx on players (room_id, user_id);
create unique index players_room_nick_idx on players (room_id, lower(nickname))
  where left_at is null;
create index players_room_idx on players (room_id);

alter table rooms
  add constraint rooms_host_fk foreign key (host_player_id)
  references players(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Partida
-- ---------------------------------------------------------------------------
-- `seat_order` é sorteado UMA vez e congelado. Toda atribuição de caderno se
-- recalcula dele por aritmética — (assento - passo) mod n — então reconectar
-- não exige histórico nenhum de quem recebeu o quê.
create table matches (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references rooms(id) on delete cascade,
  game_id     text not null,
  seat_order  uuid[] not null default '{}',
  step_index  int not null default 0,
  step_count  int not null default 0,
  -- Quem já entregou o passo corrente. Fica AQUI, e não numa contagem sobre
  -- `contributions`, porque o conteúdo das contribuições é segredo até a
  -- revelação: a sala precisa ver "6 / 10 prontos" sem poder ler um traço
  -- sequer. Uma coluna pequena numa linha que todo mundo pode ler.
  submitted_player_ids uuid[] not null default '{}',
  -- Fila de apresentação (Advogado do Diabo, Pitch no Escuro). -1 = ninguém
  -- apresentou ainda. Reaproveita `seat_order` como a ordem sorteada.
  presenter_index int not null default -1,
  -- Slideshow da revelação. Vive na partida, não em cada tela, senão dois
  -- aparelhos mostrariam páginas diferentes.
  reveal_chain_index int not null default 0,
  reveal_page_index  int not null default 0,
  reveal_autoplay    boolean not null default false,
  -- Sorteios congelados da partida: perguntas do quiz, slides da rodada.
  question_order  int[] not null default '{}',
  -- Gabarito da partida, na mesma ordem de `question_order`. O deck de
  -- perguntas continua no TS (é conteúdo); o banco guarda só o que precisa
  -- para pontuar sem perguntar nada ao cliente.
  correct_options int[] not null default '{}',
  slide_ids       text[] not null default '{}',
  used_slide_ids  text[] not null default '{}',
  punishment_index int,
  -- As fatias da roleta desta rodada e qual delas venceu. Ficam na partida —
  -- e não em cada tela — porque a TV e os celulares precisam encenar o MESMO
  -- sorteio. `topic_candidates` guarda a identidade completa (source:id).
  topic_candidates text[] not null default '{}',
  topic_winner     int not null default 0,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  -- COMO a partida acabou. Sem isto, `ended_at` sozinho não distingue
  -- "o grupo jogou até o fim" de "largaram no meio" — e para um party game
  -- essa é justamente a métrica que diz se o jogo é bom.
  ended_reason text check (ended_reason in ('completed','reset','replaced','abandoned'))
);

create index matches_room_idx on matches (room_id);
-- Uma partida viva por sala. Duas seria estado ambíguo na reconexão.
create unique index matches_one_live_idx on matches (room_id) where ended_at is null;

-- ---------------------------------------------------------------------------
-- Caderno (Telefone Sem Fio)
-- ---------------------------------------------------------------------------
create table chains (
  id               uuid primary key default gen_random_uuid(),
  match_id         uuid not null references matches(id) on delete cascade,
  owner_player_id  uuid not null references players(id) on delete cascade,
  position         int  not null,
  prompt_id        text not null default '',
  original_prompt  text not null default '',
  accepted_answers text[] not null default '{}',
  -- O host bancou o palpite na mão ("carro" x "automóvel").
  counted_as_match boolean not null default false
);

create unique index chains_match_position_idx on chains (match_id, position);

-- ---------------------------------------------------------------------------
-- Contribuição — desenho ou palpite
-- ---------------------------------------------------------------------------
-- A trava contra entrega dupla vive AQUI, e não num array em memória de um
-- celular: dedo batendo duas vezes, ou o auto-envio do prazo correndo junto
-- com o envio manual em 00:00.2, colidem nesta unique e viram UMA linha.
create table contributions (
  id           uuid primary key default gen_random_uuid(),
  match_id     uuid not null references matches(id) on delete cascade,
  chain_id     uuid not null references chains(id) on delete cascade,
  player_id    uuid not null references players(id) on delete cascade,
  step_index   int  not null,
  kind         text not null check (kind in ('drawing','guess')),
  -- Caminho no Storage. O desenho NUNCA viaja pelo Realtime.
  storage_path text,
  -- Só quando o upload não foi. Fica NESTA linha, carregada sob demanda na
  -- revelação — nunca dentro do estado da sala, nunca retransmitida a cada
  -- batimento. Era exatamente esse caminho que estourava o canal.
  strokes      jsonb,
  text         text not null default '',
  status       text not null default 'submitted'
                 check (status in ('submitted','timeout','missed','failed','pending')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index contributions_unique_idx
  on contributions (match_id, step_index, player_id);
create index contributions_chain_idx on contributions (chain_id, step_index);
create index contributions_match_step_idx on contributions (match_id, step_index);

-- ---------------------------------------------------------------------------
-- Temas do Advogado do Diabo
-- ---------------------------------------------------------------------------
-- O acervo da PARTIDA: finito e congelado no início. Diminui um a cada rodada
-- — 10, 9, 8... Antes era re-sorteado toda rodada, e por isso a roleta repetia
-- tema e o número da fatia não queria dizer nada de uma rodada para a outra.
create table match_topics (
  id           uuid primary key default gen_random_uuid(),
  match_id     uuid not null references matches(id) on delete cascade,
  topic_id     text not null,
  source       text not null check (source in ('custom','default')),
  text         text not null,
  position     int  not null,
  used_at      timestamptz,
  rejected_at  timestamptz,
  presenter_id uuid references players(id) on delete set null
);

-- Custom e default são itens DISTINTOS mesmo que o texto coincida — é o que
-- impede a confusão de "caiu no mesmo número, mas era outro tema".
create unique index match_topics_unique_idx on match_topics (match_id, source, topic_id);
create index match_topics_pool_idx on match_topics (match_id) where used_at is null;

-- ---------------------------------------------------------------------------
-- Votos e respostas
-- ---------------------------------------------------------------------------
create table votes (
  id           uuid primary key default gen_random_uuid(),
  match_id     uuid not null references matches(id) on delete cascade,
  round        int  not null,
  voter_id     uuid not null references players(id) on delete cascade,
  presenter_id uuid references players(id) on delete set null,
  rating       int  not null check (rating between 1 and 5),
  created_at   timestamptz not null default now()
);

create unique index votes_unique_idx on votes (match_id, round, voter_id);

create table answers (
  id           uuid primary key default gen_random_uuid(),
  match_id     uuid not null references matches(id) on delete cascade,
  round        int  not null,
  player_id    uuid not null references players(id) on delete cascade,
  option_index int  not null,
  answered_at  timestamptz not null default now()
);

create unique index answers_unique_idx on answers (match_id, round, player_id);

-- ---------------------------------------------------------------------------
-- Duração das fases
-- ---------------------------------------------------------------------------
-- Mora no banco porque é o BANCO que decide a transição. Se vivesse também no
-- TS seriam duas cópias do mesmo número podendo divergir — e o cliente não
-- precisa dela: ele desenha a contagem a partir de `phase_ends_at`.
-- `duration_ms = 0` significa "espera decisão humana".
create table phase_config (
  game_id     text not null,
  phase       text not null,
  duration_ms int  not null,
  next_phase  text,
  primary key (game_id, phase)
);

insert into phase_config (game_id, phase, duration_ms, next_phase) values
  ('quem-erra-paga','GAME_INTRO',    6000,  'ROUND_ACTIVE'),
  ('quem-erra-paga','ROUND_ACTIVE',  30000, 'REVEAL_ANSWER'),
  ('quem-erra-paga','REVEAL_ANSWER', 6000,  null),
  ('quem-erra-paga','FORFEIT_WHEEL', 0,     'LEADERBOARD'),
  ('quem-erra-paga','LEADERBOARD',   7000,  null),
  ('advogado-do-diabo','GAME_INTRO',    0,     'TOPIC_SPIN'),
  ('advogado-do-diabo','TOPIC_SPIN',    7000,  'TOPIC_REVEAL'),
  ('advogado-do-diabo','TOPIC_REVEAL',  7000,  'PLAYER_SPIN'),
  ('advogado-do-diabo','PLAYER_SPIN',   4000,  'PLAYER_REVEAL'),
  ('advogado-do-diabo','PLAYER_REVEAL', 4000,  'PREPARATION'),
  ('advogado-do-diabo','PREPARATION',   50000, 'COUNTDOWN'),
  ('advogado-do-diabo','COUNTDOWN',     3200,  'PRESENTATION'),
  ('advogado-do-diabo','PRESENTATION',  60000, 'VOTING'),
  ('advogado-do-diabo','VOTING',        0,     'SCORE_REVEAL'),
  ('advogado-do-diabo','SCORE_REVEAL',  0,     null),
  ('drawing-telephone','GAME_INTRO',   5000,  'DRAW_STEP'),
  ('drawing-telephone','DRAW_STEP',    90000, 'PASSING'),
  ('drawing-telephone','GUESS_STEP',   60000, 'PASSING'),
  ('drawing-telephone','PASSING',      1200,  null),
  ('drawing-telephone','REVEAL_INTRO', 0,     'REVEAL_PAGE'),
  ('drawing-telephone','REVEAL_PAGE',  0,     null),
  ('improv-slides','GAME_INTRO',    0,      'PLAYER_SPIN'),
  ('improv-slides','PLAYER_SPIN',   4000,   'PLAYER_REVEAL'),
  ('improv-slides','PLAYER_REVEAL', 4000,   'PREPARATION'),
  ('improv-slides','PREPARATION',   30000,  'COUNTDOWN'),
  ('improv-slides','COUNTDOWN',     3200,   'PRESENTATION'),
  ('improv-slides','PRESENTATION',  100000, 'VOTING'),
  ('improv-slides','VOTING',        0,      'SCORE_REVEAL'),
  ('improv-slides','SCORE_REVEAL',  0,      null);

-- ===================================================================
-- 0002_rls.sql
-- ===================================================================
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

-- ===================================================================
-- 0003_transitions.sql
-- ===================================================================
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

-- ===================================================================
-- 0004_scoring.sql
-- ===================================================================
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

-- ===================================================================
-- 0005_actions.sql
-- ===================================================================
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

  -- Partida anterior que ainda estava viva: foi SUBSTITUÍDA, não concluída.
  update matches set ended_at = now(), ended_reason = 'replaced'
   where room_id = p_room and ended_at is null;

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
  update matches set ended_at = now(), ended_reason = 'reset'
   where room_id = p_room and ended_at is null;
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
  -- Sala encerrada com partida viva: o grupo largou no meio.
  update matches set ended_at = now(), ended_reason = 'abandoned'
   where room_id = p_room and ended_at is null;
  update rooms set closed_at = now() where id = p_room;
end;
$$;

-- ===================================================================
-- 0006_snapshot.sql
-- ===================================================================
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

-- ===================================================================
-- 0008_metrics.sql
-- ===================================================================
-- Métricas.
--
-- Nenhuma tabela nova: a partida já é linha de banco, então "quantas sessões
-- foram jogadas" é uma contagem. O que falta é dar NOME às perguntas certas.
--
-- A unidade é `matches`, não `rooms`: sala criada e abandonada sem ninguém
-- entrar é lixo na métrica, e inflaria o número justamente na direção que
-- engana ("olha quanta gente jogou").
--
-- ATENÇÃO DE SEGURANÇA — leia antes de mexer:
-- View no Postgres roda com a permissão do DONO, não de quem consulta. Isso
-- FURA o RLS das tabelas de baixo. É o que a gente quer para o painel, e é
-- exatamente o que não pode vazar para o app: um cliente anônimo com acesso a
-- estas views leria dados de todas as salas. Por isso cada uma termina com
-- `revoke ... from anon, authenticated`. Se você criar uma view nova aqui,
-- copie o revoke junto.

-- ---------------------------------------------------------------------------
-- Uma linha por partida
-- ---------------------------------------------------------------------------
create or replace view metrics_matches as
select
  m.id,
  m.room_id,
  m.game_id,
  m.started_at,
  m.ended_at,
  m.ended_reason,
  coalesce(array_length(m.seat_order, 1), 0)          as jogadores,
  m.step_count                                        as passos,
  extract(epoch from (m.ended_at - m.started_at))/60  as duracao_min,
  m.ended_reason = 'completed'                        as concluida
from matches m;

revoke all on metrics_matches from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Por dia e por jogo
-- ---------------------------------------------------------------------------
-- A taxa de conclusão é a métrica que responde "o jogo é bom?". Duração média
-- só faz sentido sobre as partidas CONCLUÍDAS — incluir as abandonadas puxaria
-- a média para baixo e faria um jogo ruim parecer um jogo rápido.
create or replace view metrics_daily as
select
  date_trunc('day', started_at)::date as dia,
  game_id,
  count(*)                                          as partidas,
  count(*) filter (where concluida)                 as concluidas,
  round(
    100.0 * count(*) filter (where concluida) / nullif(count(*), 0), 1
  )                                                 as taxa_conclusao_pct,
  round(avg(jogadores), 1)                          as media_jogadores,
  max(jogadores)                                    as max_jogadores,
  round(avg(duracao_min) filter (where concluida)::numeric, 1) as duracao_media_min
from metrics_matches
group by 1, 2
order by 1 desc, 2;

revoke all on metrics_daily from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Saúde das entregas — o termômetro do playtest
-- ---------------------------------------------------------------------------
-- Esta é a que importa depois do crash. `submitted` é entrega no fluxo normal;
-- `timeout` é o auto-envio do prazo (vale como página, mas indica gente
-- correndo); `missed` é o preenchimento automático de quem não entregou nada;
-- `failed` é erro.
--
-- Se as correções funcionarem, `pct_submitted` sobe e `pct_missed` cai. Se
-- `missed` estiver alto, ou a rodada é curta demais ou tem gente caindo.
create or replace view metrics_reliability as
select
  date_trunc('day', c.created_at)::date as dia,
  m.game_id,
  count(*)                                             as contribuicoes,
  count(*) filter (where c.status = 'submitted')       as entregues,
  count(*) filter (where c.status = 'timeout')         as no_prazo_estourado,
  count(*) filter (where c.status = 'missed')          as nao_entregues,
  count(*) filter (where c.status = 'failed')          as falhas,
  round(100.0 * count(*) filter (where c.status = 'submitted')
        / nullif(count(*), 0), 1)                      as pct_submitted,
  round(100.0 * count(*) filter (where c.status = 'missed')
        / nullif(count(*), 0), 1)                      as pct_missed,
  -- Quantos desenhos precisaram cair para os traços em vez da imagem. Alto
  -- aqui significa bucket mal configurado ou rede ruim.
  count(*) filter (where c.kind = 'drawing' and c.storage_path is null
                     and c.strokes is not null)        as sem_imagem
from contributions c
join matches m on m.id = c.match_id
group by 1, 2
order by 1 desc, 2;

revoke all on metrics_reliability from anon, authenticated;

-- ===================================================================
-- 0009_profiles.sql
-- ===================================================================
-- Conta do host.
--
-- Só o HOST tem conta. Quem entra pelo QR continua anônimo, e isso é
-- deliberado: o atrito zero na entrada é a melhor qualidade do produto, e
-- pedir login a nove pessoas numa mesa de bar mataria a festa antes de
-- começar.
--
-- IMPORTANTE — o uid não muda:
-- O jogador já existe como sessão anônima, e `players.user_id` guarda esse
-- uid. O login com Google é feito por `linkIdentity()`, que PROMOVE a sessão
-- anônima a permanente mantendo o MESMO uid. Se fosse um `signInWithOAuth`
-- comum, o host ganharia um uid novo, o `join_room` não o reconheceria e ele
-- perderia o comando da própria sala — silenciosamente.

create table profiles (
  -- Mesmo id da sessão. É o que liga o perfil a `players.user_id`.
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  nickname   text,
  /**
   * Ano de nascimento, não idade.
   *
   * Idade envelhece e ficaria errada sozinha; ano de nascimento não. Também é
   * o dado mínimo para um app 16+ — guardar data completa seria mais do que o
   * necessário.
   *
   * TODO(produto): coletar isto obriga a uma política de privacidade com
   * caminho de exclusão (LGPD), e a uma decisão sobre o que fazer quando
   * alguém declarar menos de 16.
   */
  birth_year int check (birth_year between 1900 and extract(year from now())::int),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Cada um enxerga e edita apenas o próprio perfil. Não existe política de
-- leitura para terceiros: nickname de host não é dado público do jogo.
create policy profiles_select on profiles for select
  to authenticated using (id = auth.uid());
create policy profiles_update on profiles for update
  to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_insert on profiles for insert
  to authenticated with check (id = auth.uid());

/**
 * Cria ou atualiza o perfil da sessão corrente.
 *
 * O email vem de `auth.users`, nunca do cliente: deixar o cliente informar o
 * próprio email permitiria escrever o de outra pessoa.
 */
create or replace function upsert_profile(
  p_nickname text default null,
  p_birth_year int default null
) returns profiles language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  r profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'sem sessao'; end if;
  select email into v_email from auth.users where id = auth.uid();

  insert into profiles (id, email, nickname, birth_year)
  values (auth.uid(), v_email, p_nickname, p_birth_year)
  on conflict (id) do update set
    email      = coalesce(excluded.email, profiles.email),
    nickname   = coalesce(nullif(excluded.nickname,''), profiles.nickname),
    birth_year = coalesce(excluded.birth_year, profiles.birth_year),
    updated_at = now()
  returning * into r;

  return r;
end;
$$;

/**
 * Perfil da sessão corrente, ou `null` se ainda for anônima.
 *
 * Existe para a tela não precisar saber se há sessão permanente: ela pergunta
 * e recebe `null` quando não há.
 */
create or replace function my_profile()
returns profiles language sql stable security definer set search_path = public as $$
  select * from profiles where id = auth.uid();
$$;

-- Hosts cadastrados por dia. Mesmo cuidado das outras views: só para o painel.
create or replace view metrics_hosts as
select
  date_trunc('day', created_at)::date as dia,
  count(*)                            as novos_hosts,
  count(*) filter (where birth_year is not null) as com_idade
from profiles
group by 1
order by 1 desc;

revoke all on metrics_hosts from anon, authenticated;

-- ===================================================================
-- 0010_fix_gameover_snapshot.sql
-- ===================================================================
-- Correção: no GAME_OVER a foto voltava vazia.
--
-- `room_snapshot` procurava a partida com `ended_at is null` — ou seja, a
-- partida VIVA. Só que a última transição do jogo carimba `ended_at` ao entrar
-- em GAME_OVER. Resultado: exatamente na tela final, `m` vinha nulo, `chains`
-- voltava `[]`, e a projeção entregava `drawing: null`.
--
-- Na prática: tela BRANCA no melhor momento do jogo, quando a mesa ia ver o
-- estrago que os cadernos viraram. O placar também aparecia zerado — os
-- pontos estavam no banco, só não vinham na foto.
--
-- Achado pelo teste de carga com 8 jogadores; os testes por RPC não pegaram
-- porque nenhum deles olhava a sala DEPOIS do fim.
--
-- A correção é só na leitura: se não há partida viva, mostra a última. Quem
-- ESCREVE (`submit_contribution`, `advance_phase`) continua exigindo
-- `ended_at is null` — entregar desenho em partida encerrada continua sendo
-- proibido.

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
  -- Sem partida viva: a sala está em GAME_OVER (ou voltou ao lobby). Mostrar a
  -- última é o que faz a revelação e o placar final existirem.
  if not found then
    select * into m from matches where room_id = p_room
     order by started_at desc limit 1;
  end if;

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
        -- As respostas aceitas precisam vir junto: a revelação usa
        -- `chainSurvived` para desenhar o selo de "a palavra chegou inteira",
        -- e sem elas a TELA discordava do PLACAR que o banco calculou.
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

  return v_result;
end;
$$;

-- ===================================================================
-- 0011_parity.sql
-- ===================================================================
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

-- ===================================================================
-- 0012_drop_stale_overload.sql
-- ===================================================================
-- Correção: `start_match` ficou duplicada.
--
-- `create or replace function` só SUBSTITUI quando a assinatura bate exatamente.
-- O `0011` acrescentou `p_punishment_count`, então em vez de substituir criou
-- uma SOBRECARGA — e o Postgres passou a ter duas `start_match`.
--
-- O app não quebrou porque `api.startMatch` sempre manda os sete argumentos, e
-- aí o PostgREST consegue escolher. Mas qualquer chamada que omita um
-- argumento morre com "Could not choose the best candidate function", e a
-- função velha continua lá, sem a checagem de mínimo de jogadores — quem a
-- chamasse contornaria a regra sem perceber.
--
-- Lição para as próximas: mudar a lista de parâmetros de uma função exige
-- DROP explícito da versão antiga. `create or replace` não avisa.

drop function if exists start_match(uuid, jsonb, jsonb, int[], int[], text[]);

-- Confere que sobrou uma só. Estoura a migration se não sobrou — melhor
-- falhar aqui do que descobrir no meio da festa.
do $$
declare v_n int;
begin
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'start_match';
  if v_n <> 1 then
    raise exception 'start_match tem % versoes, esperado 1', v_n;
  end if;
end;
$$;

-- ===================================================================
-- 0013_reveal_payload.sql
-- ===================================================================
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

-- ===================================================================
-- 0014_party_isolation.sql
-- ===================================================================
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

-- ===================================================================
-- 0015_match_participants.sql
-- ===================================================================
-- Quem entra no meio pertence à sala, mas só joga a próxima partida.
--
-- `matches.seat_order` é a lista congelada no START_GAME. As ações abaixo
-- antes aceitavam qualquer membro ativo da sala: um recém-chegado conseguia
-- responder ou votar numa partida em que não tinha assento. Reconexão não é
-- afetada, porque preserva o mesmo player_id que já está em seat_order.

create or replace function submit_vote(p_room uuid, p_rating int)
returns void language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype; m matches%rowtype; v_me uuid; v_present uuid;
begin
  select * into r from rooms where id = p_room;
  if r.phase <> 'VOTING' or p_rating < 1 or p_rating > 5 then return; end if;

  v_me := my_player_id(p_room);
  select * into m from matches where room_id = p_room and ended_at is null;
  if v_me is null or m.id is null or not (v_me = any(m.seat_order)) then return; end if;

  v_present := m.seat_order[m.presenter_index + 1];
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
  if r.phase <> 'ROUND_ACTIVE' or now() > r.phase_ends_at
     or p_option < 0 or p_option > 3 then return; end if;

  v_me := my_player_id(p_room);
  select * into m from matches where room_id = p_room and ended_at is null;
  if v_me is null or m.id is null or not (v_me = any(m.seat_order)) then return; end if;

  insert into answers (match_id, round, player_id, option_index)
  values (m.id, r.round, v_me, p_option)
  on conflict (match_id, round, player_id) do nothing;
end;
$$;

revoke all on function submit_vote(uuid, int) from public, anon;
grant execute on function submit_vote(uuid, int) to authenticated;
revoke all on function submit_answer(uuid, int) from public, anon;
grant execute on function submit_answer(uuid, int) to authenticated;

-- ===================================================================
-- 0016_slide_preload_window.sql
-- ===================================================================
-- Pitch no Escuro: tolerância a imagem quebrada em rede móvel.
--
-- O preload começa no PLAYER_SPIN, mas seu timeout pode terminar já durante a
-- PREPARATION. A apresentação ainda não começou nesse ponto, portanto essa é
-- uma janela segura para o host substituir somente os arquivos que falharam.
-- O tamanho exato evita que um cliente defeituoso deixe alguém com menos de
-- cinco slides.

create or replace function replace_slides(p_room uuid, p_slide_ids text[])
returns rooms language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype;
begin
  if not is_host_of(p_room) then raise exception 'apenas o host'; end if;
  select * into r from rooms where id = p_room;
  if r.phase not in ('PLAYER_SPIN','PLAYER_REVEAL','PREPARATION') then return r; end if;
  if coalesce(array_length(p_slide_ids, 1), 0) <> 5 then return r; end if;

  update matches
     set slide_ids = p_slide_ids,
         used_slide_ids = used_slide_ids || p_slide_ids
   where room_id = p_room and ended_at is null;
  return r;
end;
$$;

revoke all on function replace_slides(uuid, text[]) from public, anon;
grant execute on function replace_slides(uuid, text[]) to authenticated;

-- ===================================================================
-- 0017_pitch_preparation_parity.sql
-- ===================================================================
-- Pitch no Escuro: o produto, a instrução e o registry definem 20 segundos de
-- preparação, mas o seed histórico do banco ficou em 30. O servidor é quem
-- cria o deadline, portanto a divergência aparecia diretamente no cronômetro.
-- Alinha o dado autoritativo sem alterar nenhuma outra fase do jogo.

update phase_config
   set duration_ms = 20000,
       next_phase = 'COUNTDOWN'
 where game_id = 'improv-slides'
   and phase = 'PREPARATION';

-- ===================================================================
-- 0018_drawing_delivery_grace.sql
-- ===================================================================
-- Uma contribuição vale uma página inteira do caderno. Em rede móvel, três
-- segundos não bastavam para o auto-envio receber ACK e tentar outra conexão:
-- `advance_phase` criava `missed`, e o próximo jogador via "Folha em branco".
--
-- Dez segundos só são usados quando ainda falta alguém. Se todos entregaram,
-- `all_submitted` continua avançando a fase imediatamente, sem mudar o ritmo
-- normal do jogo.
create or replace function submit_grace_ms(p_game text, p_phase text)
returns int language sql immutable as $$
  select case
    when p_game = 'drawing-telephone' and p_phase in ('DRAW_STEP','GUESS_STEP')
      then 10000 else 0 end;
$$;
