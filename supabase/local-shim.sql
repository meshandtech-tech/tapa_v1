-- O mínimo do ambiente Supabase, para validar as migrations LOCALMENTE.
--
-- NÃO rode isto no Supabase: lá tudo abaixo já existe, criado pela plataforma.
-- Isto serve para `npm run db:verify`, que sobe um Postgres descartável e roda
-- as migrations inteiras contra ele. Assim um erro de SQL aparece aqui, em
-- segundos, e não no SQL Editor no meio de uma reconstrução.
--
-- As migrations só encostam em quatro coisas da plataforma: `auth.uid()`, os
-- papéis `anon`/`authenticated`, a publication do Realtime e as extensões.

-- Papéis são do CLUSTER, não do banco: sobrevivem ao drop database, então
-- criar sem checar quebra na segunda execução.
do $$
begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;
do $$
begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;
do $$
begin
  create role service_role nologin;
exception when duplicate_object then null;
end $$;

create schema if not exists auth;

-- `profiles.id` referencia `auth.users(id)`. No Supabase esta tabela é do
-- serviço de autenticação; aqui basta a coluna que a FK enxerga, mais o email
-- que `save_profile` lê.
create table if not exists auth.users (
  id    uuid primary key,
  email text
);

-- `auth.uid()` lê o mesmo GUC que o PostgREST usa, então dá para "virar" um
-- jogador no teste com `set local request.jwt.claim.sub = '<uuid>'`.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- O Realtime do Supabase publica por aqui. As migrations acrescentam as três
-- tabelas pequenas — e é justamente isso que o verificador confere depois.
do $$
begin
  create publication supabase_realtime;
exception when duplicate_object then null;
end $$;
