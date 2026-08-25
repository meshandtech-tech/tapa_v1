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
  ended_at    timestamptz
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
