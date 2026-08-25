# Ligar o backend (30 min, uma vez)

Depois disto o celular do host deixa de ser o servidor: a partida existe no
Postgres e sobrevive a qualquer aparelho cair.

**Nada disto foi executado ainda.** Escrevi as migrations sem acesso a um
projeto real, então esta é a primeira vez que elas rodam — espere ajustar
alguma coisa. Faça num projeto novo, não num que já tenha dado certo.

---

## 1. Projeto e credenciais

1. [supabase.com](https://supabase.com) → **New project**. Região mais perto
   de quem vai jogar (São Paulo, se for aqui).
2. **Project Settings → Data API**, copie:
   - *Project URL* → `VITE_SUPABASE_URL`
   - chave **anon** / *publishable* → `VITE_SUPABASE_ANON_KEY`
3. Cole as duas no `.env` local e em **Vercel → Settings → Environment
   Variables**.

Nunca a chave `service_role`. Ela é secreta e não tem uso no Tapa.

## 2. Login anônimo

**Authentication → Providers → Anonymous sign-ins → habilitar.**

É o que dá a cada celular uma identidade que sobrevive ao F5. Sem isto, o
jogador continua sendo recusado ao voltar — que era o bug.

## 3. Migrations

**SQL Editor → New query.** Cole e rode **na ordem**, um arquivo por vez,
conferindo que cada um termina sem erro:

```
supabase/migrations/0001_schema.sql
supabase/migrations/0002_rls.sql
supabase/migrations/0003_transitions.sql
supabase/migrations/0004_scoring.sql
supabase/migrations/0005_actions.sql
supabase/migrations/0006_snapshot.sql
supabase/migrations/0007_cron.sql
supabase/migrations/0008_metrics.sql
supabase/migrations/0009_profiles.sql
```

- `0004` precisa da extensão **unaccent** (`Database → Extensions`).
- `0007` precisa da **pg_cron**. Se ela não estiver disponível no seu plano,
  **pule o 0007**: o jogo funciona sem ela. Ela só cobre o caso extremo de
  TODOS os celulares estarem em segundo plano ao mesmo tempo.

## 4. Bucket dos desenhos

**Storage → New bucket**

| campo | valor |
|---|---|
| Nome | `tapa-desenhos` |
| Público | sim |
| Limite | 1 MB |
| MIME | `image/webp`, `image/png` |

Depois **Policies → New policy** no bucket: operação `INSERT`, papel `anon`.

Este passo provavelmente nunca foi feito, e é metade da causa do crash: sem
bucket, todo upload voltava `null` e cada desenho virava ~5–15 kB de traços
guardados dentro do estado que era retransmitido inteiro a cada 3s.

## 5. Conferir

```sql
-- 1. As tabelas existem?
select table_name from information_schema.tables
 where table_schema = 'public' order by 1;

-- 2. Realtime só nas três tabelas pequenas?
select tablename from pg_publication_tables
 where pubname = 'supabase_realtime';
-- esperado: matches, players, rooms — e NENHUMA de contributions.

-- 3. RLS ligada em tudo?
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' order by 1;
```

Se `contributions` aparecer no item 2, tire — é o conteúdo dos desenhos, e ele
não pode trafegar no canal.

---

## Métricas

`0008` cria três views. Elas são só para você, no SQL Editor — cada uma tem
`revoke ... from anon, authenticated` porque view no Postgres fura o RLS das
tabelas de baixo, e sem o revoke o app conseguiria ler dados de todas as salas.

```sql
-- Quantas partidas foram jogadas, por dia e por jogo
select * from metrics_daily;

-- A pergunta que importa: as pessoas terminam o jogo?
select game_id,
       sum(partidas) as total,
       round(100.0 * sum(concluidas) / nullif(sum(partidas),0), 1) as conclusao_pct
  from metrics_daily group by 1 order by 2 desc;

-- Termômetro do crash: as entregas estão chegando?
select * from metrics_reliability order by dia desc limit 14;

-- Uma partida específica, do começo ao fim
select * from metrics_matches order by started_at desc limit 20;
```

O que olhar depois do próximo playtest:

- `taxa_conclusao_pct` — abaixo de ~70% quer dizer que estão largando no meio
- `pct_missed` em `metrics_reliability` — se estiver alto, tem gente caindo ou
  a rodada é curta demais
- `sem_imagem` — se for maior que zero, o bucket está mal configurado

---

## Teste que importa

Com dois celulares e um desktop:

1. Cria a sala no celular A, entra com B e C, começa o Telefone Sem Fio.
2. **Fecha o navegador do A no meio da partida.** B e C têm que continuar
   jogando e virar de passo pelo menos uma vez.
3. Reabre o A. Ele volta como host, com os controles, na partida em andamento.

É o único teste que prova que o celular do host não é mais o servidor. Se este
passar, o resto é ajuste.

Depois:

4. Desenha os 90 segundos inteiros e **não** aperta Enviar → o desenho tem que
   aparecer na revelação, marcado como `timeout`.
5. Digita um palpite e **não** aperta Enviar → o texto tem que valer.
6. Modo avião num celular por 30s → ele volta sozinho, no mesmo assento.

## Se algo der errado

O caminho local continua inteiro. Tire as duas variáveis do `.env` e o app
volta a rodar entre abas do mesmo navegador, com a autoridade no aparelho —
sem nuvem, mas jogável. É a rede de segurança para não ficar sem nada.
