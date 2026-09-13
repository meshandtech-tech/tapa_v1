# TAPA iOS — checklist de implementação

Última atualização: 2026-09-12.

Este é o roadmap operacional do cliente nativo. O React/Vite continua sendo um
produto ativo; SwiftUI é outro cliente do mesmo backend autoritativo. Nenhum
marco pode terminar exigindo que o web fique quebrado até o próximo.

## Estado real auditado

- [x] Web usa React 19 + Vite 7 e continua na raiz do repositório.
- [x] Supabase Auth + Postgres/RPCs + Realtime + Storage são a autoridade.
- [x] Migrations aditivas até `0022_scope_room_cleanup.sql` estão registradas.
- [x] O modo cloud recupera estado com `room_snapshot`; Realtime apenas avisa
      que uma nova foto deve ser buscada.
- [x] `apps/ios` já possui `Tapa.xcodeproj`, Swift Package, Supabase Swift,
      modelos `Codable`, Anonymous Auth, entrada por PIN e um lobby inicial.
- [x] Baseline em 2026-09-12: 422 testes web, build Vite, 6 XCTest e build do
      target iOS Simulator aprovados.
- [ ] Provar o lobby misto num simulador com configuração local segura.
- [ ] Provar background/foreground e queda/retorno de rede no simulador.

### Diferenças em relação ao plano de 2026-08-20

- A previsão de mover o reducer TypeScript para Edge Functions ficou obsoleta:
  as regras autoritativas foram implementadas em RPCs Postgres e já passaram
  testes reais de até 60 sessões.
- A previsão de `game_sessions.state JSONB` não corresponde ao schema atual.
  O banco normalizado usa salas, jogadores, partidas, respostas, votos,
  correntes e contribuições. Não criar um segundo modelo paralelo para iOS.
- Mover o web para `apps/web` agora não entrega valor ao cliente nativo e
  mudaria Vercel/imports de um produto estável. Fica adiado até existir uma
  razão operacional própria.
- A baseline antiga de 323/407 testes agora é 422.
- O gate multiplayer web está READY; o trabalho iOS pode continuar sem trocar
  Supabase, Vercel ou as regras dos jogos.
- Continuam válidos: backend autoritativo, cliente envia intenção, timestamps
  do servidor para timers, Anonymous Auth persistida, Storage interoperável,
  fixtures douradas e compatibilidade aditiva do contrato.

## Regras permanentes de segurança

- [ ] Antes e depois de qualquer alteração compartilhada/backend: `npm test`.
- [ ] Antes e depois de qualquer alteração compartilhada/backend:
      `npm run build`.
- [ ] Antes de concluir um incremento Swift: `swift test` e build de simulador.
- [ ] Nunca adicionar `service_role`, senha do banco ou segredo ao app/git.
- [ ] Nunca decidir fase, placar, sorteio, rota de caderno ou vencedor em Swift.
- [ ] Toda reconexão termina buscando um snapshot autoritativo.
- [ ] Toda mudança incompatível de backend recebe rollout compatível; não há
      janela em que o web publicado precise esperar o iOS ficar pronto.

## Marco 1 — Fundação nativa

**Objetivo:** projeto SwiftUI reproduzível, modular e compilável.

**Estimativa:** 0,5–1 dia total; maior parte já concluída.

**Dependências:** Xcode completo e XcodeGen.

**Riscos:** projeto `.xcodeproj` divergir de `project.yml`; configuração real
entrar no Git.

**Tarefas:**

- [x] Manter um único projeto em `apps/ios/Tapa.xcodeproj`.
- [x] Separar `TapaApp`, `TapaCore` e `TapaUI`.
- [x] Centralizar configuração em xcconfig e manter o arquivo real ignorado.
- [x] Resolver o SDK oficial `supabase-swift`.
- [x] Compilar Swift Package e target iOS Simulator.
- [ ] Adicionar design system nativo TAPA sem bloquear a fatia multiplayer.

**Critério de aceite:** projeto abre, dependências resolvem, pacote/testes e
target de simulador compilam.

**Status:** EM ANDAMENTO — base técnica aprovada; identidade visual pendente.

## Marco 2 — Conectividade Supabase e sessão

**Objetivo:** sessão anônima persistente e recuperável no mesmo projeto usado
pelo web.

**Estimativa:** 0,5–1,5 dia.

**Dependências:** URL e chave anon/publishable locais; Anonymous Sign-ins ativo.

**Riscos:** confiar numa sessão expirada; criar rajada de usuários anônimos;
substituir silenciosamente uma futura conta permanente.

**Tarefas:**

- [x] Cliente Supabase centralizado.
- [x] Persistência padrão do SDK no Keychain.
- [x] `signInAnonymously` quando não existe sessão.
- [x] Validar/renovar a sessão existente antes de RPCs.
- [x] Recuperar sessão anônima inválida sem apagar conta permanente.
- [ ] Testar reinício do app e refresh de token.

**Critério de aceite:** reiniciar o app preserva `auth.uid()`; token vencido é
renovado ou apresenta erro recuperável sem loop.

**Status:** EM ANDAMENTO.

## Marco 3 — Entrada, lobby ao vivo e reconexão

**Objetivo:** entrar numa sala web real, acompanhar roster e recuperar a foto
correta após background ou queda de rede.

**Estimativa:** 1–2 dias.

**Dependências:** Marcos 1–2; RPCs `resolve_room_state`, `join_room` e
`room_snapshot`; publication de `rooms`, `players` e `matches`.

**Riscos:** evento perdido entre snapshot e subscribe; rajada de snapshots;
trocar uma falha de transporte por “sala fechada”; perder a última UI offline.

**Tarefas:**

- [x] Entrada por PIN e apelido.
- [x] Erros distintos para PIN/sala/expiração/Auth.
- [x] Snapshot e roster inicial.
- [x] Assinatura Realtime nas três tabelas pequenas.
- [x] Preservar último snapshot durante falha transitória.
- [x] Expor estado conectado/reconectando na UI.
- [x] Reassinar com backoff e buscar snapshot após reconectar.
- [x] Buscar snapshot ao retornar ao foreground.
- [x] Coalescer rajadas de mudanças.
- [ ] Teste cruzado web + simulador + segundo navegador.

**Critério de aceite:** executar integralmente o primeiro teste de aceitação do
briefing, incluindo queda e recuperação sem reload.

**Status:** EM ANDAMENTO.

### MINIMUM USABLE IOS VERSION

Alcançada ao concluir o Marco 3: o app abre num iPhone, entra numa sala real e
mantém o lobby sincronizado.

## Marco 4 — Primeiro jogo multiplataforma: Quem Erra, Paga

**Objetivo:** web host + iOS player + web player chegam ao mesmo `GAME_OVER`.

**Estimativa:** 3–5 dias.

**Dependências:** Marco 3; fixtures de todas as fases do quiz; RPCs de resposta
e avanço existentes.

**Riscos:** duplicar regras/perguntas corretas; timer local divergente; iOS
antigo falhar ao decodificar campo aditivo.

**Tarefas:**

- [ ] Renderizar intro, pergunta, confirmação, revelação, prenda e placar.
- [ ] Enviar resposta apenas pela RPC autoritativa.
- [ ] Derivar tempo restante de `phaseEndsAt` e `serverTime`.
- [ ] Implementar apenas controles de host permitidos pelo backend.
- [ ] Cobrir model/view model com fixtures douradas.
- [ ] Executar partida mista completa e reconexão no meio da rodada.

**Critério de aceite:** todos os clientes mostram pergunta, fase, deadline,
resultado e placar equivalentes até `GAME_OVER`.

**Status:** PENDENTE.

### FIRST CROSS-PLATFORM MVP

Alcançado ao concluir o Marco 4: um jogador web e um jogador iOS completam um
jogo juntos com resultado autoritativo idêntico.

## Marco 5 — Advogado do Diabo

**Objetivo:** ciclo nativo de tema, preparação, apresentação, voto e nota.

**Estimativa:** 2–4 dias.

**Dependências:** Marco 4 e contrato de snapshot das fases de apresentação.

**Riscos:** iOS sortear tema/apresentador; apresentador votar em si; resultado
calculado no cliente.

**Tarefas:**

- [ ] Renderizar todas as fases e timers autoritativos.
- [ ] Voto confirmado/idempotente pela RPC.
- [ ] Controles de host e reroll usando intenções existentes.
- [ ] Haptics discretos em início, voto e revelação.
- [ ] Partida mista completa.

**Critério de aceite:** fila, tema, votos e notas iguais no web e iOS.

**Status:** PENDENTE.

## Marco 6 — Pitch no Escuro

**Objetivo:** apresentações nativas usando exatamente os slides atribuídos pelo
backend.

**Estimativa:** 3–5 dias.

**Dependências:** Marco 5; carregamento/cache das imagens atuais.

**Riscos:** randomização local; preload alterar ordem; slide divergir após
background/reconexão.

**Tarefas:**

- [ ] Renderizar preparação privada, countdown, apresentação e votação.
- [ ] Preload/cache sem mudar IDs ou ordem.
- [ ] Derivar slide atual do prazo autoritativo.
- [ ] Preservar sequência após restart/reconexão.
- [ ] Partida mista completa.

**Critério de aceite:** todos veem a sequência correta; somente o apresentador
vê o primeiro slide na preparação; votos/notas convergem.

**Status:** PENDENTE.

## Marco 7 — Telefone Sem Fio de Desenho

**Objetivo:** desenho PencilKit interoperável, confiável e recuperável.

**Estimativa:** 5–8 dias.

**Dependências:** Marco 6; Storage; formato comum de imagem; RPCs de
contribuição/finalização.

**Riscos:** perda de desenho no background; formato nativo ilegível no web;
upload finalizar no passo errado; corrente vazar antes da revelação.

**Tarefas:**

- [ ] Canvas PencilKit, desfazer, borracha e acessibilidade.
- [ ] Autosave local com chave de sala/jogador/passo.
- [ ] Exportar imagem comum para Storage.
- [ ] Registrar contribuição pending e finalizar com retry/idempotência.
- [ ] Preservar fallback interoperável quando upload falhar.
- [ ] Palpite, passagem, espera e revelação.
- [ ] Testes web ↔ iOS nos dois sentidos e reconexão durante upload.

**Critério de aceite:** cadernos mistos chegam completos à revelação, sem
página perdida, autor duplicado ou folha falsa.

**Status:** PENDENTE.

### FULL NATIVE GAME PARITY

Alcançada ao concluir o Marco 7: os quatro jogos funcionam em SwiftUI e podem
ser jogados na mesma sala com clientes web.

## Marco 8 — Polimento nativo

**Objetivo:** experiência reconhecível como TAPA e confortável no iPhone/iPad.

**Estimativa:** 3–5 dias.

**Dependências:** paridade funcional.

**Riscos:** polimento esconder erro de conexão; excesso de animação/haptic.

**Tarefas:**

- [ ] Design system, tipografia, cores, cartões e movimento TAPA.
- [ ] Dynamic Type, VoiceOver, Reduce Motion e contraste.
- [ ] Haptics com parcimônia.
- [ ] Estados vazios/offline/erro e ergonomia iPhone/iPad.
- [ ] Performance, memória, energia e cache de imagem.

**Critério de aceite:** todos os fluxos passam em aparelhos-alvo sem regressão
de acessibilidade ou multiplayer.

**Status:** PENDENTE.

## Marco 9 — Universal Links e domínio final

**Objetivo:** um link/QR abre a sala no app instalado e o web sem app.

**Estimativa:** 1–2 dias.

**Dependências:** Marco 3; domínio final; conta/time Apple definitivo.

**Riscos:** AASA com Team ID errado; catch-all da SPA servir MIME incorreto.

**DOMAIN REQUIRED BEFORE THIS STEP**

**Tarefas:**

- [ ] Definir domínio e Apple Team definitivos.
- [ ] AASA + header compatível sem quebrar rewrite do Vite.
- [ ] Associated Domains e roteamento `onOpenURL`.
- [ ] Testar câmera/QR com e sem app instalado.

**Critério de aceite:** a mesma URL entra no PIN correto pelo app ou web.

**Status:** BLOQUEADO por decisões de domínio/Apple, sem bloquear Marcos 1–8.

## Marco 10 — TestFlight

**Objetivo:** build distribuível para playtest fechado.

**Estimativa:** 1–2 dias.

**Dependências:** conta Apple, bundle ID, assinatura, Marco 3 no mínimo.

**Riscos:** entitlements/certificados; ambiente de produção incorreto.

**Tarefas:**

- [ ] Scheme Release e configuração por ambiente.
- [ ] Archive/validation/upload.
- [ ] Grupo interno, notas e checklist de playtest misto.
- [ ] Diagnóstico de crash e versão do contrato.

**Critério de aceite:** build instala via TestFlight e conclui o gate do marco
incluído na versão.

**Status:** PENDENTE.

## Marco 11 — App Store readiness

**Objetivo:** submissão segura e completa.

**Estimativa:** 3–6 dias, excluindo tempo de revisão da Apple.

**Dependências:** Marcos 8–10 e decisões legais/comerciais.

**Riscos:** privacidade, moderação de conteúdo, exclusão de conta e metadata.

**Tarefas:**

- [ ] Ícone, screenshots, descrição, suporte e política de privacidade.
- [ ] Privacy manifest/nutrition labels e justificativas de APIs.
- [ ] Exclusão de conta quando identidade permanente estiver disponível.
- [ ] Moderação/denúncia para conteúdo criado pelo usuário, se aplicável.
- [ ] Teste final web + versão candidata iOS.

**Critério de aceite:** validação sem erro e submissão com requisitos legais,
técnicos e de conteúdo atendidos.

**Status:** PENDENTE.

## Estimativa consolidada

- **Mínimo utilizável (Marcos 1–3):** aproximadamente 2–4 dias totais; a base
  existente reduz o restante para cerca de 1–2 dias mais o teste cruzado.
- **Primeiro MVP multiplataforma (até Marco 4):** aproximadamente 5–9 dias.
- **Paridade dos quatro jogos (até Marco 7):** aproximadamente 15–26 dias.
- **Polimento + links + distribuição (Marcos 8–11):** 8–15 dias.
- **Total realista:** 23–41 dias úteis, sujeito a playtests, conta Apple e
  eventuais mudanças aditivas no contrato. As faixas serão atualizadas com a
  evidência de cada marco.
