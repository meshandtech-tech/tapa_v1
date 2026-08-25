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
