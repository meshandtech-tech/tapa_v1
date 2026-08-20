# Tapa — iOS nativo + backend compartilhado

> **Status:** plano aprovado em 2026-08-20. Nada implementado ainda.
> A web continua no ar e funcionando: 4 jogos, 323 testes, `main` publicada.

---

## ⚠️ LEIA ANTES DE COMEÇAR — como não quebrar o app

O Tapa **já funciona e já tem gente jogando**. Este plano é migração, não
reescrita. Sete regras, todas aprendidas na marra neste projeto:

1. **Toda fase termina com a web funcionando.** Se uma fase deixa o produto
   quebrado "até a próxima", a fase está mal desenhada. Divida.

2. **Não mexa no cronômetro.** `phaseDeadline` é timestamp e os clientes
   derivam localmente. Isso já está certo e é o que segura a sincronia. Mudar
   para contagem por mensagem seria regressão.

3. **O caminho antigo só morre na Fase 5.** Até lá, o broadcast continua
   funcionando lado a lado com o servidor, atrás de flag. Se a Fase 4 der
   errado numa festa real, tem que dar para voltar **sem deploy**.

4. **Antes de cada commit: `npm test` e `npm run build`.** A baseline é
   **323 testes**. Se caiu, ou você quebrou algo ou o teste estava errado —
   descubra qual antes de seguir.

5. **Antes de considerar uma fase pronta: partida de verdade em 4 navegadores.**
   Perfis separados do Chrome, lendo o dado DA TELA e nunca montando no script.
   Foi assim que apareceram o QR sumido, a gaveta travada do host e o canvas
   que aceitava traço sem pintar. Nenhum desses passou nos testes.

6. **`service_role` nunca sai do servidor.** Nem no Swift, nem no bundle da web,
   nem no git. No cliente, só a chave anon/publishable.

7. **A ordem importa em dois lugares:**
   - A **conta Apple** (§11) precisa estar decidida **antes da Fase 7** — o
     Team ID entra no AASA e trocar depois quebra deep link de quem já instalou.
   - A **Root Directory da Vercel** muda junto com a Fase 2. Valide no preview
     antes de tocar em `main`.

### Onde começar amanhã

**Fase 1**, e ela não toca em nenhum arquivo da web: criar o projeto Supabase,
escrever as migrations da §4 e as policies, e provar com um script que um
anônimo **falha** ao ler sala alheia. Zero risco para o que está no ar.

### O que eu preciso de você antes da Fase 1

- Criar o projeto Supabase de produção (Pro, ~R$ 135/mês) e me passar a URL e a
  chave **anon**. A `service_role` fica com você, configurada como secret das
  Edge Functions — eu nunca preciso vê-la.
- Decidir o domínio final (o AASA e o Universal Link dependem dele).

---

# Tapa — Arquitetura para o app nativo de iOS, com a web viva

## Context

O Tapa hoje é um SPA que funciona: quatro jogos, 323 testes, no ar na Vercel.
O pedido é crescer para um app nativo em Swift/SwiftUI **sem abandonar a web**,
com os dois clientes na MESMA sala e na MESMA partida em tempo real.

Este documento é auditoria + decisão + roteiro. Nada de código ainda.

---

## 1. Auditoria — o que realmente existe

Três achados mudam o desenho inteiro. Vale ler antes de qualquer decisão.

### 1.1 Não é Next.js. É Vite.

O briefing supõe Next.js com API routes e Server Actions. **Não existe nada
disso.** É um SPA em Vite 7 + React 19 + react-router-dom, publicado como
arquivos estáticos:

```json
// vercel.json — hoje
{ "framework": "vite", "outputDirectory": "dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

**Zero código de servidor.** Sem `api/`, sem `functions/`, sem `supabase/`.
Consequência prática: não existe hoje um lugar de confiança para rodar nada.
Isso não é dívida — foi decisão consciente — mas é o que precisa mudar.

**Efeito colateral imediato e concreto:** aquele `rewrites` de catch-all vai
engolir `/.well-known/apple-app-site-association`, que é o arquivo que faz
Universal Link funcionar. Ele precisa ser servido como `application/json`, e
sem extensão a Vercel serve como octet-stream. É config, não código — mas se
passar batido, o deep link "não funciona e ninguém sabe por quê".

### 1.2 A autoridade do jogo é um CELULAR

Este é o achado central. Toda a lógica de jogo roda num `useReducer` dentro do
aparelho de quem criou a sala (`usePartyRoom.ts`). Esse aparelho calcula as
fases e transmite o `PartyState` inteiro por Supabase Realtime **broadcast**.
Os outros aparelhos só renderizam.

O que isso implica:

- **Não há banco.** Nenhuma tabela. O Supabase é usado só como cano de
  mensagens. O estado durável vive em `localStorage`.
- **Se o aparelho do host morre de vez, a partida morre com ele.** Existe
  revezamento de autoridade (`TAKEOVER_MS`), mas o novo host reidrata do último
  `STATE` que recebeu — pode custar a rodada corrente.
- **Todo segredo do jogo está no aparelho de todo mundo.** Quem abrir o devtools
  vê os temas das outras correntes do Telefone Sem Fio, e as respostas certas do
  quiz já vão no bundle (`src/data/questions.ts`).

Eu documentei essas duas últimas como limitações aceitas. **Elas deixam de ser
aceitáveis com dois clientes**, e o trabalho aqui as resolve de graça.

### 1.3 O reducer é praticamente puro — e é isso que salva o projeto

`partyReducer.ts` tem 997 linhas; com os helpers puros dos jogos, são ~1500
linhas de REGRA DE JOGO. Se o Swift reimplementar isso, os dois clientes vão
divergir. Não "talvez": divergência em jogo significa duas pessoas vendo fases
diferentes na mesma sala.

A boa notícia: o reducer recebe tempo e sorteio POR ARGUMENTO
(`action.now`, `order`, `slideIds`, `punishmentIndex`, `seatOrder`, `prompts`).
Foi decisão de projeto lá atrás, para ele ser testável. Sobraram **exatamente
dois pontos de impureza**:

| Onde | O quê |
|---|---|
| `pickWinner()` (linha ~563) | `crypto.getRandomValues` / `Math.random` direto |
| `REROLL_TOPIC` (linha ~814) | um `Date.now()` sem o `action.now ?? …` |

**Supabase Edge Functions rodam Deno, que executa TypeScript nativamente.** O
mesmo arquivo sobe para o servidor quase intacto — conserta esses dois pontos e
pronto. Não é porte, é mudança de endereço. E os 323 testes continuam testando
exatamente o código que roda em produção.

Sem isso, este projeto seria "reescrever 1500 linhas de regra em Swift e rezar".
Com isso, vira "mover um arquivo".

### 1.4 O resto do inventário

| Área | Situação |
|---|---|
| Rotas | `/`, `/join`, `/host/:pin`, `/play/:pin` |
| Estado | `useReducer` + broadcast; `localStorage` para persistir |
| Realtime | `SupabaseRealtimeAdapter` (broadcast) com fallback `BroadcastChannel` |
| Auth | **Não existe.** O PIN é a única credencial |
| Banco | **Não existe** |
| Storage | **Não existe** — o bucket `tapa-desenhos` nunca foi criado; os desenhos viajam como traços pelo canal |
| Slides | 32 imagens no bundle (`src/assets/slides/`) |
| Cronômetro | Já é timestamp (`phaseDeadline`), derivado localmente. **Está certo, não mexer** |
| Testes | 323, Vitest |
| Git | A raiz do repo é `despedida_de_solteiro_/` (nome legado; no GitHub é `tapa_v1`) |

---

## 2. A decisão central: onde o reducer roda

É a única decisão que importa de verdade. Tudo decorre dela.

| | Autoridade no cliente (hoje) | **Autoridade no servidor (recomendado)** |
|---|---|---|
| Regra de jogo | duplicada em TS e Swift | **um arquivo, os dois renderizam** |
| Host fecha o app | partida em risco | partida continua |
| Segredo | visível no devtools | fica no banco, atrás de RLS |
| Latência de transição | ~0 | +80–200 ms, só na virada de fase |
| Cronômetro | timestamp local | **igual — nada muda** |

Os +200 ms assustam menos do que parecem: só acontecem quando a FASE vira, que
é um evento raro e já tem animação em cima. O que precisa ser instantâneo —
o traço do desenho, a contagem regressiva, o slide trocando — continua local,
porque é derivado de timestamp e não de mensagem.

**Recomendação: servidor.** Com dois clientes, manter a regra no cliente é
escolher a divergência.

---

## 3. Arquitetura recomendada

```
   ┌──────────────────┐              ┌──────────────────┐
   │  SwiftUI (iOS)   │              │  React (web)     │
   │  supabase-swift  │              │ supabase-js      │
   └────────┬─────────┘              └────────┬─────────┘
            │  intenção (ação)                │
            │  ex.: {type:"ANSWER", option:2} │
            └───────────────┬─────────────────┘
                            ▼
              ┌───────────────────────────┐
              │  Edge Function  `play`    │   Deno · TypeScript
              │  ── partyReducer.ts ──    │   O MESMO arquivo do web
              │  compare-and-set (version)│
              └─────────────┬─────────────┘
                            │
      ┌─────────────────────┼──────────────────────┐
      ▼                     ▼                      ▼
┌───────────┐      ┌────────────────┐      ┌──────────────┐
│ Postgres  │      │ Realtime       │      │ Storage      │
│ verdade   │─────►│ broadcast p/   │      │ desenhos +   │
│ + RLS     │      │ a sala         │      │ slides       │
└───────────┘      └────────────────┘      └──────────────┘
      ▲
      │ Postgres Changes = caminho de RECUPERAÇÃO (reconexão, F5)
      └──────────────────── clientes
```

**Cliente manda intenção, nunca estado.** Hoje `HostCommand` já é assim — o
host manda "quero avançar", não "o estado agora é este". Esse contrato só muda
de endereço.

### Por que broadcast E Postgres Changes

- **Broadcast** leva o estado novo em ~50 ms. É o caminho normal.
- **Postgres Changes** é mais lento (~150–300 ms) mas é a fonte durável: quem
  reconecta, quem dá F5, quem estava em background — lê a linha e volta certo.

Usar só um dos dois seria escolher entre rápido e confiável. Usar os dois custa
uma linha a mais na function.

### Quem avança a fase quando o prazo vence

Sem cron e sem timer no servidor: **qualquer cliente que perceber o prazo
vencido chama `play` com `ADVANCE`.** A function confere no banco que (a) o
prazo realmente venceu e (b) a `version` bate. O primeiro ganha; os outros
recebem "já avançou" e não fazem nada.

É a resposta ao `phaseVersion` do briefing — e resolve de graça um problema que
hoje não existe só porque há uma autoridade única.

---

## 4. Modelo de dados

Enxuto de propósito. O erro clássico aqui é virar cada transição em linha de
banco e matar o tempo real.

```sql
profiles(id → auth.users, display_name, avatar_seed, is_permanent)
rooms(id, pin UNIQUE, host_id, status, created_at, closed_at)
room_players(room_id, player_id, nickname, color, avatar_seed, joined_at, seat)
game_sessions(id, room_id, game_id, protocol_version,
              state JSONB,          -- o PartyState público
              phase, phase_ends_at, version INT, updated_at)
session_secrets(session_id, player_id, payload JSONB)  -- RLS: só o dono lê
match_assets(session_id, chain_id, step, storage_path, player_id)
app_config(key, value JSONB)        -- flags e versão mínima suportada
```

**`state` é um JSONB único, não trinta tabelas.** O `PartyState` já existe,
já é serializável, já é validado (`parsePartyState`). Quebrá-lo em tabelas
normalizadas geraria dezenas de escritas por transição sem nenhum ganho para
uma sala de 5–10 pessoas. Uma linha por sessão, uma escrita por virada de fase.

**`session_secrets` é o que resolve o vazamento.** O tema secreto de cada
caderno, a resposta certa da pergunta corrente e os slides que ainda não
apareceram vivem ali, com RLS que só devolve a linha do jogador designado. O
`state` público sai limpo. É o único jeito honesto de responder "não mande
conteúdo escondido para o cliente".

### RLS, em uma frase cada

| Tabela | Regra |
|---|---|
| `rooms` | qualquer autenticado cria; leitura só de sala aberta ou onde já é membro |
| `room_players` | entra sozinho em sala aberta; edita só a própria linha |
| `game_sessions` | leitura para membros da sala; **escrita só pela function** (service role) |
| `session_secrets` | leitura só onde `player_id = auth.uid()`; escrita só pela function |
| `match_assets` | leitura para membros da sala |

Nenhuma escrita de estado de jogo vem do cliente. É isso que fecha a lista de
ameaças do briefing — trocar de fase, mexer em placar, votar duas vezes,
responder pelo outro — porque o único caminho de escrita valida tudo no reducer.

---

## 5. Autenticação

| Papel | Como |
|---|---|
| **Convidado** | `signInAnonymously()` do Supabase. Ganha JWT e `auth.uid()` sem cadastro nenhum. Abre o link, escolhe nome e avatar, entra |
| **Host** | Conta permanente. **Sign in with Apple** no iOS, **e-mail OTP** na web |
| **Upgrade** | `linkIdentity()` transforma o anônimo em permanente **mantendo o mesmo `uid`** — histórico e placar sobrevivem |

Anônimo do Supabase é melhor que token de convidado feito à mão por três
motivos concretos: o JWT já é entendido pelo RLS (sem isso, toda policy vira
código), a sessão já persiste no Keychain pelo SDK do Swift, e o caminho de
upgrade já existe pronto.

**Um detalhe do briefing que precisa de decisão:** hoje ninguém tem conta e
qualquer um cria sala. Exigir conta do host é uma barreira nova numa festa. A
sugestão é ser progressivo — criar sala como anônimo funciona; conta só entra
quando quiser algo que atravessa sessões (histórico, salas fixas, App Store).
Assim nada regride para quem já usa.

---

## 6. Repositório: monorepo

**Recomendação: mesmo repositório.** Não por gosto — por causa da §1.3.

O `partyReducer` vai ser consumido por três lugares ao mesmo tempo: a web, a
Edge Function e (como fonte de verdade do contrato) o gerador de modelos Swift.
Em dois repositórios, "atualizar o protocolo" vira coordenar dois PRs e torcer.
No mesmo repo, é um commit que quebra o build de quem ficou para trás — que é
exatamente o comportamento desejado.

```
tapa/
  apps/
    web/                 ← o app de hoje inteiro, movido
    ios/                 ← projeto Xcode
  packages/
    protocol/            ← types + partyReducer + fixtures douradas
  supabase/
    migrations/
    functions/play/
```

Na Vercel: Root Directory = `apps/web`. É a única mudança de deploy.

---

## 7. Manter TS e Swift compatíveis

Duas camadas, porque geração sozinha não basta.

**1. Geração.** `packages/protocol` é a fonte. Pipeline:
`ts-json-schema-generator` → JSON Schema → `quicktype` → structs `Codable`.
Roda no CI; se o Swift gerado mudar e não for commitado, o build falha.

**2. Fixtures douradas — é isto que de fato pega a divergência.** Um conjunto de
JSONs de estado real (lobby, rodada, votação, revelação, fim). O teste do TS e o
teste do Swift decodificam os MESMOS arquivos e afirmam o mesmo resultado. Um
campo renomeado no TS quebra o teste do Swift no CI, não na festa de alguém.

**3. Versão de protocolo.** `protocol_version` na sessão e
`min_supported_protocol_version` em `app_config`. Regra: mudanças só ADITIVAS
dentro de uma versão (campo novo opcional, nunca renomear nem remover). Quando
precisar quebrar, sobe a versão e o app antigo mostra "atualize o Tapa" em vez
de renderizar errado — que é o pior desfecho possível.

---

## 8. Universal Links

Uma URL só, como o briefing pede: `https://<domínio>/join/<PIN>`. O QR aponta
para ela. O sistema decide app ou navegador.

Precisa de:

1. `apps/web/public/.well-known/apple-app-site-association` com
   `{"applinks":{"details":[{"appIDs":["TEAMID.com.suaempresa.tapa"],"components":[{"/":"/join/*"}]}]}}`
2. **Header explícito no `vercel.json`** — `Content-Type: application/json` para
   esse caminho, e garantir que o catch-all não o engula (§1.1)
3. Entitlement `Associated Domains` = `applinks:<domínio>` no Xcode
4. `onOpenURL` no SwiftUI → rota de sala

**Atenção ao Team ID.** O AASA carrega o Team ID. Trocar de conta Apple depois
significa reescrever o AASA e quebrar o deep link de quem já instalou. Ou seja:
a decisão de conta (§11) tem que vir ANTES desta fase, não depois.

---

## 9. Desenho e imagens no iOS

**PencilKit**, não `Canvas` do SwiftUI. Você pediu que a experiência nativa
fosse melhor que a da web, e o PencilKit entrega de graça o que custaria semanas:
Apple Pencil com pressão e inclinação, predição de traço, borracha, desfazer.

O formato de troca continua sendo **imagem no Storage** —
`PKDrawing.image(from:scale:)` → PNG/WebP → upload. Web vê o desenho do iOS e
vice-versa, sem ninguém precisar entender o formato do outro.

O que se perde: os traços vetoriais que a web usa como fallback. Não é perda
real — aquele fallback existe justamente porque o bucket nunca foi criado. Com
Storage no ar, ele vira só o caminho de desenvolvimento offline.

**Slides: tirar do bundle e pôr no Storage.** Hoje as 32 imagens são compiladas
no app. Na web isso é indiferente; no iOS significa **submeter uma versão à App
Store para adicionar um meme**. Com Storage + CDN + cache local (`URLCache`),
você adiciona imagem e os dois clientes veem na hora.

---

## 10. Custo, e o que pode escapar

Com o teto de ~$25/mês: **um projeto Supabase Pro em produção, tier free como
desenvolvimento.** Vercel segue no hobby. Apple são $99/ano à parte.

O que NÃO preocupa: sala de 5–10 pessoas, uma escrita por virada de fase,
poucas mensagens de realtime. Isso não chega perto de nenhum limite.

O que pode escapar, em ordem:

1. **Egresso de Storage.** Uma partida de Telefone Sem Fio com 10 pessoas gera
   ~50 desenhos (~4 MB) e, na revelação, cada um é baixado por 10 aparelhos —
   ~40 MB de egresso por partida. 100 partidas/mês ≈ 4 GB. Cabe em 100 GB, mas
   escala com o número de partidas ao QUADRADO do tamanho da sala.
2. **Desenho que nunca é apagado.** Sem política de retenção, o bucket só cresce.
   Uma função agendada que apaga assets de partidas com mais de 30 dias resolve,
   e é barata.
3. **Broadcast do estado inteiro.** O `PartyState` do jogo de desenho carrega o
   arquivo de todas as correntes (~20 KB) e hoje é reemitido a cada batimento de
   3 s. No modelo novo o batimento some (o banco é a verdade), mas vale trocar
   o broadcast de estado cheio por **delta** se o payload crescer.

---

## 11. Um ponto que não é técnico, e importa

Você disse que a conta Apple é do sócio, usada no BOCA, e que **este você quer
construir sozinho**.

Vale separar duas coisas:

- **Desenvolver** não precisa de conta paga. Simulador roda com Apple ID
  gratuito. Dá para ir até o fim da Fase 6 sem gastar nada.
- **Publicar sob o time do sócio significa que o app fica no nome daquela
  entidade.** App Store Connect, Sign in with Apple e o AASA são todos por time.

Como o AASA carrega o Team ID e trocar depois quebra deep link de quem já
instalou, a recomendação é: **desenvolver no simulador agora e abrir a sua
própria conta antes da Fase 7 (Universal Links)** — não antes, não depois.

---

## 12. As 13 respostas

| # | Pergunta | Resposta |
|---|---|---|
| 1 | Mesmo repo ou separado? | **Mesmo.** O protocolo é compartilhado; separar garante divergência |
| 2 | SwiftUI? | **Sim.** Nativo de verdade, sem WebView |
| 3 | Supabase como backend? | **Sim** — Postgres + Auth + Realtime + Storage + Edge Functions numa peça só |
| 4 | Vercel continua com a web? | **Sim.** Só muda o Root Directory |
| 5 | Host com conta permanente? | **Sim, mas progressiva** — anônimo cria sala; conta quando quiser o que atravessa sessões |
| 6 | Convidado anônimo? | **Sim**, `signInAnonymously` — RLS e Keychain já entendem |
| 7 | Universal Links? | Uma URL, AASA em `public/.well-known/` + header na Vercel |
| 8 | Como sincronizar? | Cliente manda intenção → function roda o reducer → Postgres (verdade) + broadcast (velocidade) |
| 9 | Postgres vs Presence/Broadcast? | **Postgres**: estado, placar, fase. **Broadcast**: o estado novo, para chegar rápido. **Presence**: quem está online. Cronômetro: **nem um nem outro** — timestamp |
| 10 | Desenhos e imagens? | Storage compartilhado. iOS desenha em PencilKit e exporta imagem. Slides saem do bundle |
| 11 | Modelos compatíveis? | Geração a partir do TS + **fixtures douradas nos dois lados** + versão de protocolo |
| 12 | Qual jogo primeiro? | **Quem Erra, Paga** — tem cronômetro, resposta, placar e ação de host, e nenhum canvas |
| 13 | Migração segura? | Strangler: function no ar sem uso → web usa atrás de flag → vira padrão → remove autoridade do cliente |

---

## 13. Roteiro

Cada fase termina com **produto funcionando**. Nenhuma quebra a web.

### Fase 1 — Fundação Supabase *(sem tocar na web)*
- **Meta:** banco, auth, RLS e a function `play` no ar, ainda sem ninguém usando
- **Backend:** projeto Pro; migrations do §4; policies; `signInAnonymously`
- **Web:** nada
- **Risco:** RLS mal escrita passa despercebida → **testes de policy** (um usuário tentando ler sala alheia) antes de seguir
- **Pronto quando:** um script consegue criar sala, entrar como anônimo, e **falha** ao ler sala de outro

### Fase 2 — Monorepo + `packages/protocol`
- **Meta:** o reducer vira pacote consumido pela web e pela function
- **Arquivos:** mover tudo para `apps/web/`; extrair `partyReducer.ts`, `types.ts` e helpers puros para `packages/protocol/`; corrigir as **duas impurezas** do §1.3
- **Web:** só imports; comportamento idêntico
- **Risco:** Vercel apontando para a pasta errada → validar em preview antes de main
- **Pronto quando:** 323 testes verdes, build limpo, preview da Vercel idêntico à produção

### Fase 3 — `play` roda o jogo de verdade
- **Meta:** a function executa o mesmo reducer e escreve no Postgres
- **Backend:** `supabase/functions/play/`; compare-and-set por `version`; broadcast pós-escrita; `session_secrets` para conteúdo escondido
- **Risco:** dois clientes avançando junto → resolvido pelo `version`; **testar com corrida proposital**
- **Pronto quando:** um script joga uma partida inteira de Quem Erra, Paga só chamando a function

### Fase 4 — Web atrás de flag
- **Meta:** a web usa o servidor, com o caminho antigo intacto
- **Web:** `usePartyRoom` ganha um transporte alternativo; `VITE_SERVER_AUTHORITY` escolhe
- **Risco:** regressão silenciosa em festa real → manter o fallback e um jeito de voltar sem deploy
- **Pronto quando:** partida completa de 4 jogadores nos dois modos, com o mesmo resultado

### Fase 5 — Servidor vira o padrão
- **Meta:** cortar a autoridade do cliente
- **Web:** remover reducer local, revezamento e batimento; F5 e queda do host passam a recuperar do banco
- **Ganho que já vale sozinho:** host fechar o app deixa de matar a partida, e o segredo sai do devtools
- **Pronto quando:** host fecha o app no meio e a partida continua nos outros aparelhos

### Fase 6 — Casca do app iOS *(simulador)*
- **Meta:** Xcode, `supabase-swift` (Auth + Realtime + PostgREST), login anônimo, `NavigationStack`, design system
- **Swift:** `Core/{Networking,Realtime,Auth,Models,DesignSystem}` + `Features/…`; MVVM com `@Observable`
- **Pronto quando:** o simulador entra numa sala criada pela web e mostra o lobby ao vivo

### Fase 7 — Sala nativa + Universal Links *(precisa da conta Apple — §11)*
- **Meta:** criar/entrar em sala pelo app, QR e link abrindo direto
- **Backend/Web:** AASA + header na Vercel
- **Pronto quando:** QR lido pela câmera abre o app na sala certa; sem o app, abre a web

### Fase 8 — Fatia vertical: Quem Erra, Paga
- **Meta:** a prova do briefing — host no iPhone, um na web, um no iPad, um no Android, todos na mesma partida
- **Pronto quando:** partida inteira, cronômetro batendo igual nos quatro, placar idêntico

### Fase 9 — Advogado do Diabo *(votação e apresentação)*
### Fase 10 — Telefone Sem Fio *(PencilKit + Storage; a mais complexa)*
### Fase 11 — Pitch no Escuro *(slides saem do bundle para o Storage)*
### Fase 12 — App Store
- Ícones, política de privacidade, nutrition labels, **exclusão de conta** (obrigatória com login), TestFlight, crash reporting

---

## 14. Verificação

- **Testes de policy** (Fase 1): um cliente anônimo tentando ler sala alheia tem de FALHAR. Sem isso, RLS vira decoração.
- **Fixtures douradas** (Fase 2+): mesmos JSONs decodificados por Vitest e por XCTest.
- **Corrida proposital** (Fase 3): dois clientes chamando `ADVANCE` no mesmo milissegundo produzem UMA transição.
- **Partida de quatro navegadores** (Fase 4/5): o método que já achou os bugs reais deste projeto — perfis separados do Chrome, lendo da TELA e nunca montando dado no script.
- **Partida mista** (Fase 8): iPhone + Safari + Android + iPad, uma sala, do lobby ao placar.

---

## 15. O que eu faria diferente do briefing

Três pontos, para você discordar se quiser:

1. **Exigir conta do host desde o começo é regressão.** Hoje se cria sala em dois
   toques. Conta permanente resolve problemas que só aparecem depois (histórico,
   App Store) — entra progressiva, não como porteiro.
2. **Não normalizar o estado do jogo em tabelas.** O `PartyState` como JSONB
   único é mais rápido, mais simples e já validado. Normalizar seria bonito no
   diagrama e pior no Friday à noite.
3. **Feature flags, sim, mas minúsculas.** Uma tabela `app_config` com
   `min_supported_protocol_version` e um booleano por jogo. Nada de serviço de
   flags — isso é para desligar um jogo quebrado sem passar pela App Store, e
   nada além disso.

---

## 16. GCP ou DigitalOcean no lugar da Vercel + Supabase?

Resposta curta: **não, e por motivos específicos deste projeto — mas você
levantou um ponto que muda uma conta.**

O que este produto precisa: hospedagem estática, Postgres, WebSocket pub/sub,
auth (anônimo + Sign in with Apple), object storage com CDN, e um lugar de
confiança para rodar o reducer. São seis coisas.

| | O que você ganha | O que você passa a operar |
|---|---|---|
| **DigitalOcean** | Postgres gerenciado (~US$15) e Spaces (~US$5) | **auth e realtime não existem** — você escreve e mantém um servidor WebSocket e uma camada de sessão, com uptime, patch e escala por sua conta |
| **GCP / Firebase** | Auth, realtime, storage e functions de verdade, SDK Swift excelente | Firestore cobra **por leitura/escrita**: 10 aparelhos ouvindo um documento = 10 leituras por transição. Barato hoje, mais difícil de prever depois |
| **Supabase (atual)** | as seis peças num produto só, SDK first-party em JS **e Swift**, Postgres com RLS | quase nada |

Três razões concretas para ficar:

1. **Já está no projeto.** Credenciais, cliente e o `SupabaseRealtimeAdapter`
   funcionando. Trocar é jogar fora código que roda para chegar no mesmo lugar.
2. **DigitalOcean te devolve o trabalho de construir auth e realtime.** Para uma
   pessoa sozinha tocando um jogo de festa, é a troca errada.
3. **Firebase é lateral, não superior.** Funciona bem — inclusive o reducer
   também rodaria lá, porque Functions é Node/TypeScript. Mas RLS em SQL é mais
   direto para a regra "só o jogador designado lê este segredo", e a conta de
   Postgres é mais fácil de prever que a de Firestore.

### Mas duas coisas suas fazem sentido, e uma delas é urgente

**A Vercel Hobby é para uso não comercial.** No momento em que o Tapa cobra,
o plano gratuito deixa de servir e vira Pro, ~US$20/mês. E o site é um SPA
estático — não usa nada específico da Vercel.

→ **Mover a web para Cloudflare Pages** quando a monetização entrar: gratuito,
sem limite de banda, sem cláusula de uso comercial. Ganho direto de ~R$ 110/mês.

**Egresso de Storage é o custo que mais escala aqui (§10).** Cloudflare R2 tem
**egresso zero**. Se o Telefone Sem Fio pegar, migrar só o bucket para o R2
mantendo o resto no Supabase é uma troca cirúrgica, não uma migração.

Ou seja: o instinto de sair da Vercel está certo — só que o destino é
Cloudflare, não DigitalOcean, e a hora é quando começar a cobrar.

---

## 17. Monetização (R$)

### O que vender

Jogo de festa se usa algumas vezes por ano. **Assinatura tem churn brutal nesse
padrão de uso** — o Jackbox vende pacote vitalício justamente por isso.

Modelo recomendado: **freemium com quem paga sendo o HOST.**

| | Grátis | **Tapa Completo — R$ 39,90 uma vez** |
|---|---|---|
| Jogos | 2 (Quem Erra, Paga + Advogado do Diabo) | os 4, e os próximos |
| Sala | até 6 pessoas | até 10 |
| Conteúdo | decks padrão | temas próprios, packs de slides, mais perguntas |

A economia é boa: **um pagante serve 5–10 pessoas por noite**, e o grupo
pressiona o host a comprar. Ninguém que entra por QR precisa pagar nada — o
que preserva o atrito zero que o produto tem hoje.

Opcional depois: R$ 12,90/mês para quem prefere não desembolsar de uma vez.

### Como cobrar — e por que os dois caminhos existem

| Canal | Meio | Taxa | Quem fica com quanto |
|---|---|---|---|
| **Web** | **Pix** via PSP brasileiro (Mercado Pago, Pagar.me, Asaas) | ~1% | R$ 39,50 de R$ 39,90 |
| **iOS** | **IAP obrigatório** (regra da Apple para conteúdo digital) | 15% no Small Business Program | R$ 33,90 de R$ 39,90 |

Duas coisas importantes:

- **O Small Business Program da Apple derruba a comissão de 30% para 15%** para
  quem fatura menos de US$ 1M/ano. É inscrição manual e vale a pena no dia um.
- **O app não pode apontar para o pagamento da web** (regra de anti-steering).
  Mas vender na web e **destravar no app** é permitido e é o padrão que
  Netflix e Spotify usam. Como o Pix custa 1% contra 15%, vale empurrar a
  compra pela web fora do app — por e-mail, pelo site, pelo grupo.

Pix não é detalhe: é como o brasileiro paga. Um checkout só com cartão perde
uma fatia grande do público.

### O que precisa existir na infraestrutura

Encaixa exatamente na arquitetura das seções anteriores — a Edge Function já é
o ponto de decisão:

```sql
entitlements(user_id, product, source, -- 'apple' | 'pix'
             active, expires_at, original_transaction_id)
```

- **Apple → App Store Server Notifications V2** chega numa Edge Function, que
  valida a assinatura e grava o entitlement.
- **PSP → webhook** de Pix confirmado chega em outra function, mesma tabela.
- **A checagem acontece dentro do `play`**, no servidor. "Esta sala pode abrir o
  Telefone Sem Fio?" é pergunta de servidor. Checar no cliente seria o mesmo que
  não checar — e é a única parte da monetização com risco real de segurança.

Isso entra como **Fase 13**, depois da App Store. Construir cobrança antes de
existir alguém para cobrar é a ordem errada.

### Custo real, em R$

| | Hoje | Com o app no ar | Cobrando |
|---|---|---|---|
| Supabase | R$ 0 | ~R$ 135/mês (Pro) | ~R$ 135/mês |
| Hospedagem web | R$ 0 (Vercel Hobby) | R$ 0 | **R$ 0 (Cloudflare Pages)** — Vercel viraria ~R$ 110 |
| Apple | — | ~R$ 535/ano | ~R$ 535/ano |
| PSP | — | — | ~1% do que entrar |

**Ponto de equilíbrio: cerca de 5 vendas por mês** cobrem a infraestrutura
inteira. É um número baixo o suficiente para não travar decisão nenhuma.
