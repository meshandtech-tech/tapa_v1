# Auditoria de confiabilidade multiplayer — 2026-09-09

## Resultado executivo

O defeito de “sala fechada” foi reproduzido e sua causa foi identificada.
Não era LAN, cache do navegador, PIN duplicado, projeto Supabase divergente nem
uma queda geral do Realtime.

A sequência real era:

1. a sessão anônima permanecia como jogador ativo na sala A;
2. `create_room` criava corretamente a sala B;
3. antes de mostrar o formulário de apelido, o cliente pedia
   `room_snapshot(B)`;
4. a regra de isolamento da migration 0014 devolvia `room_forbidden`, pois a
   mesma identidade ainda pertencia à sala A;
5. `useCloudRoom` convertia qualquer `snapshot.error` em `closed`;
6. a tela afirmava incorretamente “O host encerrou a party”.

As migrations `0021_room_lifecycle_reliability.sql` e
`0022_scope_room_cleanup.sql`, junto do cliente, corrigem a causa, o lifecycle e
o diagnóstico. A 0021 foi aplicada e passou no smoke de produção; o stress com
duas salas encontrou uma corrida adicional, corrigida e confirmada em produção
pela 0022. O frontend ainda precisa ser publicado antes de considerar a
experiência de produção corrigida.

## Arquitetura encontrada

O modo cloud já tem a forma correta para web + iOS:

```text
Safari / Chrome / futuro app Swift
        │ sessão Supabase Auth
        ▼
RPCs Postgres ──► rooms / players / matches / ações do jogo
        │
        ├── snapshot autoritativo (`room_snapshot`)
        ├── avisos Realtime (`rooms`, `players`, `matches`)
        └── Storage (imagens; conteúdo grande não passa no WebSocket)
```

O host é uma permissão em `rooms.host_player_id`, não um servidor. Realtime é
um sinal de invalidação; após conexão/reconexão o estado vem novamente do
Postgres. Não existe endereço IP local, subnet, WebSocket local ou navegador do
host servindo a partida no caminho cloud.

## Evidência da reprodução

- Uma sessão criou e entrou na primeira sala; outra sessão entrou e o roster
  convergiu por Realtime.
- O host iniciou o quiz e os dois navegadores chegaram à mesma fase ativa.
- Sem encerrar/sair da sala, o host voltou à landing e criou outra sala.
- `create_room` respondeu HTTP 200.
- `room_snapshot` respondeu HTTP 200 com `error=room_forbidden`.
- A UI mostrou “A SALA FECHOU”.
- O cliente tinha um único channel Realtime ativo; não havia subscriptions
  duplicadas. A lista inicialmente suspeita era histórico acumulado do monitor
  de rede.

As salas temporárias criadas pelo teste foram encerradas ao final.

## Correções implementadas

### Banco e lifecycle

- Lobby novo pode ser lido antes do `join` mesmo quando a sessão ainda aparece
  em uma sala anterior.
- A troca de sala só abandona associações antigas depois que o novo `join`
  confirmou sucesso. Erro de apelido ou sala cheia não expulsa o jogador da
  sala atual.
- Ao trocar, o host da sala anterior passa ao membro ativo mais antigo.
- Sala que ficou vazia é fechada e libera o PIN; match vivo recebe
  `ended_reason=abandoned`.
- `leave_room` agora fecha sala vazia.
- `close_room` grava `close_reason=host_closed`.
- Salas têm expiração autoritativa de 24 horas, longa o suficiente para não
  confundir suspensão de Safari ou troca de rede com abandono.
- `resolve_room_state` distingue `room_not_found`, `room_closed`,
  `room_expired`, `invalid_pin` e falha de autenticação.
- Migrations já aplicadas não foram reescritas; a correção da corrida é aditiva
  na 0022.
- O rollout fecha salas abertas há mais de cinco minutos sem jogador ativo,
  limpando criações interrompidas sem disputar com o formulário recém-aberto.
- A 0022 limita toda limpeza de troca às salas anteriores da mesma identidade;
  uma entrada concorrente não pode encerrar outro lobby entre create e join.

### Cliente e reconexão

- Falha de fetch/RPC de snapshot não retorna mais `null` interpretável como
  lifecycle; ela vira estado offline e retry com backoff.
- Durante uma queda, o último snapshot continua na tela. A pessoa não é
  expulsa para uma tela de “procurando sala”.
- Voltas por `online`, `visibilitychange` e `pageshow` sempre buscam o snapshot
  autoritativo; eventos perdidos no Realtime não são necessários para convergir.
- `offline` mostra um badge não bloqueante.
- Leituras de snapshot são single-flight e coalescem rajadas em no máximo uma
  releitura pendente.
- Falha de Auth durante recuperação aciona validação/refresh da sessão antes
  de tentar novamente.
- Produção sem variáveis Supabase não cai silenciosamente no transporte local;
  mostra erro explícito de configuração.

### UX de erro

A tela agora diferencia:

- sala não encontrada;
- sala encerrada;
- sala expirada;
- PIN inválido;
- sessão antiga/conflitante;
- autenticação expirada;
- rate limit;
- rede offline;
- falha inesperada do servidor.

Mensagens internas continuam fora da UI.

### Observabilidade

Foram adicionados eventos estruturados para criação, entrada, início, Realtime,
reconexão, recuperação de sala/jogador, encerramento e erro de RPC. O contexto
inclui IDs de sala, match e jogador quando disponíveis, sem tokens ou chaves.

Com `?debug=1`, os últimos 200 eventos ficam em `sessionStorage` e sobrevivem a
refresh da aba; o painel existente permite copiar o log. Isso é diagnóstico de
playtest, não uma plataforma central de logs.

## Identidade, cache e persistência

### Caminho cloud

- `localStorage:tapa-auth`: sessão Supabase; é o que preserva o `user_id` no F5
  e na troca Wi-Fi/5G.
- `localStorage:tapa:theme` e `tapa:theme-mode`: apenas aparência.
- `sessionStorage:tapa:diagnostics:v1`: somente eventos de diagnóstico.
- Rascunhos do desenho usam chave com PIN, player e passo; não decidem sala,
  match ou identidade.
- Não há Service Worker registrado, Cache Storage, IndexedDB, room ID, player
  ID ou match ID persistido no caminho cloud.
- As chaves `tapa:party:<pin>:*` pertencem apenas ao fallback local de
  desenvolvimento e ficam inertes quando Supabase está configurado.

Portanto, o cenário observado não vinha de um `room_id` antigo no navegador;
vinha de uma linha `players.left_at is null` legítima no banco.

Anonymous Auth continua adequado para entrada sem cadastro. A limitação é que,
se o usuário apagar os dados do navegador ou perder definitivamente o refresh
token, uma identidade anônima não pode ser recuperada. O link de identidade
Google existente preserva o UID para quem quiser uma identidade permanente.

## Realtime e rede

- Um único cliente Supabase por página e um channel por sala.
- Cleanup remove o channel no unmount/troca de sala.
- `CHANNEL_ERROR`, `TIMED_OUT` e `CLOSED` usam retry exponencial com teto de 8s.
- Toda assinatura e toda reconexão terminam em snapshot.
- Presença de 15s só mede atividade; perder presença não fecha a sala.
- Outro membro só pode reivindicar host depois de 31s sem presença; o Postgres
  serializa a decisão.
- Teste de navegador: cortes separados de 5 e 30 segundos preservaram
  lobby/identidade/host e mostraram o badge; ao voltar online, novos snapshots
  chegaram e a conexão voltou ao normal.
- `pageshow` de BFCache também disparou ressincronização.

## Database, RLS e RPCs

- RLS permanece habilitada em todas as 11 tabelas.
- Somente `rooms`, `players` e `matches` estão na publication Realtime.
- Escritas continuam passando por RPCs `SECURITY DEFINER` com checagens de
  membro/host.
- PIN aberto continua protegido por índice unique parcial.
- Entrada na mesma sala continua serializada por lock, preservando capacidade
  de 10 pessoas.
- Uma única partida viva por sala continua protegida por índice unique.
- As migrations 0021/0022 não desabilitam RLS nem dão acesso às RPCs internas.

O `pg_cron` segue opcional para fases cronometradas. A expiração nova é lazy no
acesso, portanto não depende do cron para impedir que uma sala velha volte a
ser tratada como aberta.

## Environment e Vercel

- O repositório configura Supabase em `.env`/`.env.example` e lê apenas
  `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` ou
  `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Scripts de smoke/stress usam o mesmo `.env`.
- Não foram encontrados project refs hardcoded no frontend.
- Bundle público e `.env` local apontam ao mesmo project ref e à mesma chave
  pública (comparação por fingerprint, sem imprimir a chave).
- `gametapav1.vercel.app` está no commit `f3ea086`, branch `main`, com deploy
  bem-sucedido.
- A rewrite SPA para `index.html` está correta. HTML/assets usam revalidação e
  não há Service Worker capaz de prender uma build antiga.
- Existem dois projetos Vercel (`tapaversao1` e `despedida-de-solteiro`)
  publicando o mesmo commit. Não causou o bug reproduzido, mas deve existir um
  projeto/domínio canônico documentado para evitar editar env no projeto
  errado.
- Este checkout não está ligado por `.vercel` e a conexão disponível não
  listou teams; por isso Preview env e logs privados da Vercel não puderam ser
  comparados. Como o app é estático, os logs críticos ficam no Supabase e no
  diagnóstico do navegador.

## Testes executados

- `npm test`: 25 arquivos e 422 testes aprovados.
- `npm run build`: TypeScript e build Vite de produção aprovados.
- `npm run db:verify`: bundle completo aplicado em Postgres vazio e todas as
  invariantes aprovadas.
- `git diff --check`: aprovado.
- Schema completo reconstruído do zero com todas as migrations.
- Regressão SQL: sala antiga não bloqueia o lobby novo.
- Regressão SQL: join novo limpa associação antiga, transfere host e preserva
  a sala antiga quando ainda há jogadores.
- Regressão SQL: sala vazia fecha e libera PIN.
- Regressão SQL: expiração retorna estado próprio.
- 30 ciclos automatizados criar → entrar → trocar/encerrar com a mesma
  identidade, sem associação ambígua.
- Testes unitários de resolução, erros de snapshot e classificação de UX.
- Browser: criação, duas sessões, roster Realtime, início de partida, cortes
  offline de 5 e 30 segundos, retorno online e `pageshow`.
- Smoke contra produção com migrations 0015–0022: Auth, criação, entrada,
  início, snapshots, late join, votação idempotente, transições, troca A → B e
  cleanup, além da corrida entre dois lobbies no intervalo create → join.
- Stress 1×10 pós-0021 aprovado: 300 RPCs, zero retry/erro persistente,
  reconexão e partida completa.
- Stress 2×10 encontrou uma corrida entre create/join: 1/2 salas concluiu e o
  outro lobby foi fechado por uma entrada concorrente. Essa evidência originou
  a migration 0022; o teste não é contado como aprovado.
- Repetição pós-0022 de 2×10 aprovada: 1.982 RPCs, zero retry/erro persistente,
  duas partidas completas, Realtime convergente e Storage validado.
- Stress final pós-0022 de 6×10 aprovado: 60 identidades/canais, 5.986 RPCs,
  zero retry/erro persistente, 6/6 partidas em `GAME_OVER`, maior mensagem
  Realtime de 1,5 kB e p95 máximo de 502,3 ms. Os dois jogos de desenho
  produziram 10 cadernos × 10 páginas sem buracos ou autores duplicados.
- Evidência anterior preservada no repositório: 6 salas × 10 sessões,
  5.421 RPCs, 1 retry transitório, zero erro persistente, seis jogos completos;
  maior mensagem Realtime de 1,5 kB.

Os comandos `npm run stress:1`, `npm run stress:2` e `npm run stress:6` deixam
essa subida gradual reproduzível; cada sala usa dez identidades e channels
Realtime próprios.

Limites desta rodada: a automação visual usou Chrome headless, não o engine do
Safari/iOS; latência, jitter e perda parcial de pacotes não foram simulados
separadamente. Os cortes offline totais de 5 e 30 segundos passaram. Safari
real e troca Wi-Fi/5G real pertencem ao gate de rollout, não devem ser
apresentados como já aprovados.

## Decisão de infraestrutura

**Recomendação: manter Supabase + Vercel nesta fase.**

Para 60 pessoas, a arquitetura medida está muito abaixo dos limites atuais. A
tabela oficial de Realtime informa 200 conexões concorrentes no Free e 500 no
Pro, e os eventos do Tapa são pequenos. O cliente não usa Realtime como fonte
de verdade, o que reduz o impacto de evento perdido ou reconexão.

O maior risco operacional imediato não é compute: é o limite de Anonymous Auth
por IP. O padrão documentado é 30 novos logins anônimos/hora/IP, exatamente o
formato de 60 aparelhos novos no mesmo Wi-Fi. Antes do playtest, conferir no
Dashboard o valor de `rate_limit_anonymous_users` e habilitar CAPTCHA/Turnstile
antes de abrir o produto ao público. Supabase também não limpa usuários
anônimos automaticamente; criar uma rotina administrativa mensal quando o
volume justificar.

Fontes:

- [Supabase Realtime limits](https://supabase.com/docs/guides/realtime/limits)
- [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- [Supabase Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous)

AWS/GCP só passam a ter benefício concreto se o Tapa precisar de servidor de
simulação de alta frequência, matchmaking global, múltiplas regiões ativas ou
controle operacional que as RPCs/Postgres Changes não atendam. DigitalOcean é
mais simples que AWS/GCP, mas ainda transfere patching, observabilidade,
backups, WebSocket e on-call para a equipe. Hoje isso aumentaria risco e tempo
sem resolver a causa encontrada.

Uma evolução híbrida plausível é manter Postgres/Auth/Storage e mover apenas
orquestrações que provarem precisar de processo durável. Não fazer isso antes
de métricas reais de playtest.

## Cloud credit strategy

Prioridade recomendada:

1. [Vercel for Startups](https://vercel.com/startups/credits): até US$ 30 mil
   para equipes elegíveis ligadas a parceiros; preserva a infraestrutura atual.
2. Perguntar ao acelerador/investidor por benefício Supabase ou negociar
   créditos diretamente; a documentação pública confirma saldo/top-up, mas não
   anuncia um tier universal de startup.
3. [Google for Startups Cloud](https://startup.google.com/cloud/): até US$ 2
   mil para estágio inicial sem equity e benefícios maiores para startups
   financiadas; guardar para um experimento concreto, não para migrar por saldo.
4. [AWS Activate](https://aws.amazon.com/startups/credits): Founders começa em
   US$ 1 mil e pode chegar a US$ 5 mil; Portfolio depende de provider e pode ser
   maior. Bom plano B para serviços específicos.
5. [DigitalOcean Startups](https://www.digitalocean.com/startups): avaliar se
   simplicidade de VM/managed DB se tornar requisito; o antigo Hatch foi
   substituído pelo programa atual.

Crédito não deve decidir arquitetura. Registrar validade, serviços elegíveis,
limite de overage e custo pós-crédito antes de aceitar cada programa.

## Swift/iOS

A arquitetura permite uma sala mista Safari + Chrome + SwiftUI porque identidade,
roster, host, match e transições estão no Supabase. O cliente Swift deve consumir
as mesmas RPCs/snapshots e nunca duplicar as regras dos jogos. O desenvolvimento
nativo permanece pausado até o gate web abaixo.

O scaffold da Fase 6 já existe em `apps/ios`, incluindo projeto Xcode, pacote,
modelos de snapshot, serviço Supabase, lobby SwiftUI, fixture compartilhável e
XCTest. Com `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`, o pacote
compilou e o teste de decode passou. A seleção global ainda aponta para
`/Library/Developer/CommandLineTools`; para usar `swift test`/`xcodebuild` sem o
prefixo, falta selecionar o Xcode completo via `xcode-select`.

## Gate de produção

Estado atual: **BACKEND READY; FRONTEND AINDA PRECISA SER PUBLICADO**.

Ordem obrigatória:

1. ~~Aplicar as migrations 0021 e 0022 no projeto canônico.~~
2. ~~Executar `npm run verify:production` contra 0015–0022.~~
3. ~~Executar 1 sala, depois 2, depois 6×10.~~
4. Publicar o frontend deste diff.
5. Repetir criação/entrada/encerramento no domínio publicado, incluindo Safari
   real e uma troca Wi-Fi/5G real.
6. Marcar o gate de playtest como READY.

Nenhuma migração de infraestrutura e nenhum trabalho novo de iOS deve entrar
antes desse gate.
