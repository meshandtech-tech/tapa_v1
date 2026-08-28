# Ligar o backend (30 min)

Depois disto o celular do host deixa de ser o servidor: a partida existe no
Postgres e sobrevive a qualquer aparelho cair.

Serve tanto para a primeira vez quanto para **reconstruir do zero** — projeto
apagado, ou mudança de região (a região de um projeto Supabase não muda depois
de criado: reconstruir é o único caminho).

**Antes de abrir o painel, rode `npm run db:verify`.** Ele sobe um Postgres
descartável, aplica o `all-migrations.sql` inteiro e confere o resultado em
segundos. Descobrir um erro de SQL ali é barato; descobrir no meio da
reconstrução deixa metade das migrations aplicadas, que é o pior estado
possível.

## Reconstrução, em ordem

1. `npm run db:verify` — o esquema aplica limpo?
2. Painel: **New project**, região **São Paulo** (`sa-east-1`).
3. Login anônimo + limites de cadastro (§2).
4. `supabase/all-migrations.sql` de uma vez (§3), e depois o `0007` (opcional).
5. `supabase/storage.sql` (§4) — o bucket.
6. `.env` local + Vercel com a URL e a chave NOVAS (§1).
7. `npm run test:live` — a prova real: 10 sessões anônimas jogam uma partida
   inteira contra o projeto novo.

O passo 7 é o que fecha. Ele exercita migrations, RLS, RPC, Realtime, Storage
e login anônimo de uma vez; se ele passa, o backend está de pé.

---

## 1. Projeto e credenciais

1. [supabase.com](https://supabase.com) → **New project**. Região mais perto
   de quem vai jogar — **São Paulo (`sa-east-1`)** para uma festa no Brasil.
   A região **não muda depois**: escolher errado custa uma reconstrução
   inteira. Ohio para jogadores no Brasil é meio segundo a mais em cada
   viagem, e o jogo faz muitas.
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

**E confira o limite de cadastros: Authentication → Rate Limits.**

O limite de sessões anônimas é **por IP**, e uma festa inteira sai do mesmo
wi-fi: dez pessoas entrando ao mesmo tempo é exatamente o formato que estoura.
Já derrubou um teste nosso. O app espaça as tentativas sozinho
(`ensureAnonSession` tenta 4 vezes com jitter) e mostra "Muita gente entrando
de uma vez" quando bate no teto — mas o teto é configuração do painel, e num
projeto novo ele volta ao padrão.

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
supabase/migrations/0010_fix_gameover_snapshot.sql
supabase/migrations/0011_parity.sql
supabase/migrations/0012_drop_stale_overload.sql
supabase/migrations/0013_reveal_payload.sql
```

Ou, num banco **novo e vazio**, cole `supabase/all-migrations.sql` de uma vez
só — é o mesmo conteúdo, na mesma ordem, sem o `0007`.

### Atualizar um banco que JÁ existe

Rode **só a migration nova**, sozinha. Não recole o `all-migrations.sql`: ele
é para instalação do zero e começa com `create table` sem `if not exists`, então
num banco existente ele falha na primeira tabela e **nada depois dele roda** —
você acha que atualizou e não atualizou.

Da `0006` em diante quase tudo é `create or replace function`: rodar duas vezes
não faz mal, e não há bloqueio nem perda de dado. A exceção é a `0012`, que dá
`drop function` explícito antes.

- `0004` precisa da extensão **unaccent** (`Database → Extensions`).
- `0007` precisa da **pg_cron**. Se ela não estiver disponível no seu plano,
  **pule o 0007**: o jogo funciona sem ela. Ela só cobre o caso extremo de
  TODOS os celulares estarem em segundo plano ao mesmo tempo.

## 4. Bucket dos desenhos

Cole **`supabase/storage.sql`** no SQL Editor. Pelo SQL e não pelo painel
porque é reproduzível e não depende de clicar na coisa certa — e o arquivo é
idempotente, então numa reconstrução em que você não lembra até onde chegou,
rodar de novo não custa nada.

Ele fica fora de `migrations/` porque mexe em `storage.buckets` e
`storage.objects`, que são da plataforma: dentro de `migrations/` quebraria o
`npm run db:verify`, que roda num Postgres comum.

`insert` e `create policy` não devolvem linhas: **"no rows returned" aqui é
sucesso.**

Este passo é metade da causa do crash de terça. Sem bucket, todo upload volta
`null`, todo desenho vira traço guardado dentro do estado, e o estado era
retransmitido inteiro a cada 3s.

### Como conferir (o jeito certo)

NÃO pergunte "o bucket existe?". Eu perdi tempo com isso: `storage.list()`
devolve `[]` **sem erro** para um bucket que não existe, então a checagem passa
e não significa nada.

A única verificação que vale é o round-trip — **subir um arquivo e ler de volta
pela URL pública**:

```sql
-- O que o painel sabe
select id, public, file_size_limit, allowed_mime_types
  from storage.buckets where id = 'tapa-desenhos';
```

...e depois, de fato, subir uma imagem pelo app e ver ela aparecer na
revelação. Ou pedir para o agente rodar o teste de upload.

A lição serve para o resto: **ausência de erro não é prova de funcionamento.**
Três checagens minhas deram falso positivo por isso — RPC chamada sem
argumentos, `count` sob RLS, e `storage.list`. Toda asserção aqui deve afirmar
um resultado, não a falta de exceção.

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


---

## Estado verificado

> As duas rodadas abaixo foram feitas no projeto **de Ohio, que foi apagado**.
> Valem como histórico do que o esquema já provou — não como estado do projeto
> de São Paulo. Para o projeto novo, o que vale é `npm run db:verify` (esquema,
> offline) seguido de `npm run test:live` (partida inteira, no projeto de
> verdade).

### Primeira rodada (25/08)

Rodado no projeto real, com sessões anônimas de verdade:

| | |
|---|---|
| Migrations 0001–0006, 0008, 0009 | ✓ |
| pg_cron (0007) | ✓ |
| Login anônimo | ✓ |
| `create_room` / `join_room` / `room_snapshot` / `start_match` | ✓ |
| Idempotência: 3 envios do mesmo jogador → 1 linha | ✓ |
| Corrida: 4 `advance_phase` simultâneos → 1 avanço | ✓ |
| RLS: jogador lê 0 contribuições alheias | ✓ |
| Backfill: 4 cadernos, 4 páginas cada, 0 buracos | ✓ |
| Métricas bloqueadas para o app (42501) | ✓ |
| Bucket: upload anon → leitura pública → bytes idênticos | ✓ |
| MIME proibido recusado | ✓ |

### Segunda rodada (26/08)

Suíte de carga com 8 jogadores nos 4 jogos: 2.485 chamadas RPC, 0 retries,
0 erros de canal, maior mensagem de Realtime **1,3 kB** (limite: 256 kB).

| | |
|---|---|
| Partidas completas até GAME_OVER | 4/4 |
| Nenhuma tese repetida no acervo finito | ✓ |
| Reconexão no meio da partida | ✓ |
| Bucket por round-trip (upload → URL pública → bytes idênticos) | ✓ |

Nove lacunas de paridade banco↔tela corrigidas em `0010` e `0011`, cobertas
por `src/party/cloud/projection.test.ts` — teste que foi verificado
reintroduzindo os bugs: 6 dos 14 casos falham sem as correções.

**Ainda NÃO verificado** — e é o que sustenta a tese do trabalho todo:

- [ ] Fechar o navegador do host no meio da partida e os outros continuarem
      jogando, com o host voltando ao comando ao reabrir
- [ ] Reconexão de celular real (modo avião 30s)
- [ ] Auto-envio de desenho e de palpite com dedo na tela
- [ ] Safari iOS em tela cheia

Tudo acima foi provado por RPC, o que prova o BANCO. Não prova o app no
celular.
