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
supabase/migrations/0010_fix_gameover_snapshot.sql
supabase/migrations/0011_parity.sql
```

- `0004` precisa da extensão **unaccent** (`Database → Extensions`).
- `0007` precisa da **pg_cron**. Se ela não estiver disponível no seu plano,
  **pule o 0007**: o jogo funciona sem ela. Ela só cobre o caso extremo de
  TODOS os celulares estarem em segundo plano ao mesmo tempo.

## 4. Bucket dos desenhos

Pelo **SQL Editor**, não pelo painel — é reproduzível e não depende de clicar
na coisa certa:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tapa-desenhos', 'tapa-desenhos', true, 1048576,
        array['image/webp','image/png'])
on conflict (id) do update
   set public = true,
       file_size_limit = 1048576,
       allowed_mime_types = array['image/webp','image/png'];

create policy "tapa upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'tapa-desenhos');

create policy "tapa leitura" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'tapa-desenhos');
```

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

## Estado verificado (25/08)

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
