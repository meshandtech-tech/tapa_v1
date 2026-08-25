-- Rede de segurança do relógio.
--
-- Sem isto, uma sala em que TODOS os celulares foram para segundo plano ao
-- mesmo tempo ficaria parada na mesma fase para sempre. A partida não pode
-- depender de nenhum aparelho estar acordado — era exatamente esse o defeito
-- da arquitetura anterior, só que concentrado num aparelho só.
--
-- Requer a extensão pg_cron (Supabase: Database > Extensions > pg_cron).

create extension if not exists pg_cron;

select cron.schedule(
  'tapa-close-overdue-phases',
  '5 seconds',
  $$ select close_overdue_phases(); $$
);
