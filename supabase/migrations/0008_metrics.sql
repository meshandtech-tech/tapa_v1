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
