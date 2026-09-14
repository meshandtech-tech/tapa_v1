# Auditoria Swift — 2026-09-14

Commit auditado: `c7cd0eb`, incluindo o checkpoint de desenho `3fa41ff`.

## Parecer

Os quatro jogos possuem telas e ações nativas no projeto existente. A separação
entre TapaCore, TapaUI e Supabase é uma base adequada para continuar. Porém,
implementação presente e build aprovada não equivalem a multiplayer pronto:
há falhas concretas de ciclo de sala e desenho e riscos de envio atrasado.

Esta rodada é somente auditoria. Nenhuma correção de código, migration,
configuração de produção ou publicação foi realizada. Este documento é a entrega.

## Evidências e limites

- `swift test --package-path apps/ios`: 49 testes passaram no macOS.
- Build Xcode Release para `generic/platform=iOS Simulator`: concluída, exit 0,
  com assinatura desativada. Não é archive assinado nem validação TestFlight.
- Diagnóstico isolado compilando os arquivos reais `RoomSnapshot.swift`,
  `QuizPresentation.swift`, `JSONValue.swift` e `DrawingDocument.swift`:
  confirmou erro de decoding dos envelopes de erro, identidade de revelação
  inalterada entre páginas e crash com índice de cor fora do intervalo de Int.
- Contratos comparados com as migrations locais até 0022 e fluxos web atuais.
  Não foi consultado nem alterado o banco de produção nesta rodada.
- Sem partida multiplayer real, medição Instruments, UI automation ou execução
  em iPhone físico/iOS 17. Os testes existentes usam mocks de RoomService;
  não comprovam o transporte Supabase, Keychain ou renderização no aparelho.

## Achados prioritários

### 1. P1 — Sala encerrada/expirada vira falha de decoding e reconexão contínua

Referências: `Sources/TapaCore/Networking/SupabaseRoomService.swift:115`,
`Sources/TapaCore/Models/RoomSnapshot.swift`,
`Sources/TapaCore/Lobby/LobbyViewModel.swift:270`,
`Sources/TapaUI/TapaRootView.swift:22`.

A migration 0021 retorna apenas `{"error":"room_closed"}` (ou room_expired,
room_not_found, sem_sessao). O serviço tenta primeiro decodificar RoomSnapshot,
que exige room/me/players/etc. A leitura falha com `keyNotFound(room)` antes do
teste `value.error`. Reproduzido para os quatro envelopes.

Durante uma partida, o model mantém `.joined` e o snapshot antigo enquanto a
interface mostra reconexão. O estado terminal não chega à tela de encerramento.
Além disso, não há ação nativa de sair/trocar de sala nem limpeza da sessão salva.

Sugestão: decodificar o envelope de erro antes do snapshot; representar erro
terminal separadamente de falha de rede; encerrar observação/polling da sala
terminal e oferecer retorno à entrada. Implementar saída explícita usando a
RPC `leave_room` já existente, sem tratar background como saída da sala.

### 2. P1 — Reenvio não identifica a rodada/caderno a que pertence

Referências: `Sources/TapaCore/Networking/SupabaseRoomService.swift:177`,
`:201`, `:224`; `Sources/TapaCore/Lobby/LobbyViewModel.swift:617`.

As três tentativas de contribuição enviam somente sala, conteúdo e status.
Não levam match_id, chain_id ou step_index esperados. A RPC SQL 0020 escolhe
o caderno e o passo atuais quando processa a chamada. Se a fase avançar durante
uma queda/repetição, o desenho anterior pode entrar como contribuição de um
novo passo. O lock SQL serializa a operação, mas não identifica a intenção
original de uma chamada que só chegou depois da transição.

Respostas do quiz e votos também enviam apenas sala + valor e têm a mesma
limitação contratual caso uma chamada alcance outra rodada válida. No desenho
a janela é especialmente relevante: PASSING é curto e ambos os tipos de passo
são aceitos pela mesma RPC. O ACK já fornece chain_id/step_index, mas o DTO
nativo os descarta; o DTO de voto também descarta round.

Constatação por inspeção do contrato, ainda sem reprodução em banco real.

Sugestão: identificar cada ação por partida e rodada/passo desde a UI; abandonar
retries quando a intenção fica obsoleta; conferir a identidade no ACK. Para
fechar a corrida no servidor, introduzir validação transacional dos campos
esperados por RPC compatível com o cliente web. Isso exige trabalho de backend
deliberado e teste de compatibilidade; não aplicar como efeito desta auditoria.

### 3. P1 — Desenho malformado pode derrubar o app

Referência: `Sources/TapaCore/Models/DrawingDocument.swift:64` e `:83`.

`Int(versionValue)` e `Int(rawColor)` convertem Double sem verificar o intervalo.
O documento JSON válido `{"v":2,"g":2048,"s":[[0,28,1e20,100,100]]}` provocou
SIGTRAP no diagnóstico com o decoder real. O banco aceita p_strokes JSONB sem
validar essas faixas na função inspecionada. Uma contribuição malformada de
outro cliente pode, portanto, derrubar o participante que a renderiza.

Não é um desenho produzido normalmente pela interface atual; é uma falha na
validação de conteúdo recebido. Sugestão: validar versão, inteiros exatos,
faixas, cores e limites de pontos/traços antes de converter ou alocar. Recusar
payload inválido com fallback recuperável, sem fatal error.

### 4. P2 — Próxima página funciona, mas o host recebe mensagem de erro

Referências: `Sources/TapaCore/Lobby/LobbyViewModel.swift:431`,
`Sources/TapaCore/Models/QuizPresentation.swift:109`.

`forceAdvance` confirma sucesso pela mudança de actionRoundKey. Na revelação,
o SQL altera revealPageIndex/revealChainIndex mantendo fase REVEAL_PAGE e round.
A chave não contém esses índices. Reproduzido: página 0 → 1 preserva a chave e
aciona a condição de erro. O host pode tentar novamente e passar uma página
que a mesa ainda estava vendo.

Sugestão: confirmar cada comando pelo campo que ele modifica; para revelação,
comparar caderno/página e tratar a chegada ao GAME_OVER. Também revisar a
proteção contra duplicação quando fase e deadline não mudam entre páginas.

### 5. P2 — Avanço de fases depende de refresh a cada cinco segundos

Referências: `Sources/TapaUI/TapaRootView.swift:52`,
`Sources/TapaCore/Lobby/LobbyViewModel.swift:228`.

Os timers das telas atualizam a apresentação, mas o pedido de avanço ocorre
apenas após buscar um snapshot. Sem outro evento de dados ou cliente web que
dispare o avanço, o iOS espera o próximo polling de cinco segundos, acrescido
da latência das chamadas. Fases curtas podem ficar visivelmente em zero.

Sugestão: agendar um pedido cancelável para o deadline oficial, respeitando a
folga do desenho e distribuindo tentativas por assento. Manter polling como
recuperação e o servidor como autoridade. O web já contém esse agendamento.

### 6. P2 — Os prazos curtos não cobrem autenticação

Referências: `Sources/TapaCore/Networking/SupabaseRoomService.swift:16`,
`:185`, `:451`.

prepareSession faz autenticação/validação sem o timeout da aplicação.
authenticatedRPC aguarda client.auth.session antes de entrar no withTimeout
do envio. Se houver refresh de token durante uma rede ruim, a operação pode
demorar mais que os 2,5/5/8 segundos anunciados nos comentários. Esses prazos
valem para execute, não para a operação completa.

Sugestão: orçamento de tempo ponta a ponta, incluindo aquisição de sessão;
propagar cancelamento e não repetir erros permanentes de autenticação como
se fossem quedas transitórias. Conferir com transporte controlado, não só mock
de RoomService que responde imediatamente.

### 7. P2 — Relógio incorpora o atraso da resposta como desvio do aparelho

Referência: `Sources/TapaCore/Lobby/LobbyViewModel.swift:225`.

serverOffset é calculado subtraindo o instante local de RECEBIMENTO do
serverTime produzido pelo servidor. Assim, parte do atraso de rede vira
desvio de relógio. Dois aparelhos com atrasos diferentes podem mostrar
cronômetros/slides diferentes temporariamente, apesar do mesmo deadline.

Sugestão: medir envio/recebimento, estimar offset pelo ponto médio, privilegiar
amostras de menor RTT e evitar saltos bruscos. Validar com atrasos assimétricos;
nenhuma estimativa elimina toda a incerteza de uma rede móvel.

### 8. P2 — Restauração automática usa PIN reciclável, não a identidade da sala

Referência: `Sources/TapaCore/Lobby/LobbyViewModel.swift:7` e `:173`.

SavedRoomSession guarda apenas PIN e apelido. Após expirar a sala, o mesmo PIN
pode identificar outra party. Ao relançar o app, activate chama join pelo PIN e
pode entrar automaticamente nessa nova sala.

Sugestão: persistir roomID junto ao PIN e validar sua identidade antes de
restaurar. PIN reutilizado deve pedir uma nova entrada intencional.

## Melhorias de performance e cobertura

- Realtime: cada alteração de players/rooms/matches pode disparar refresh;
  presença também muda players. O stream com buffer 1 limita parte da fila,
  mas polling e confirmação de ações ainda podem buscar snapshots ao mesmo
  tempo. Centralizar refresh em uma operação compartilhada e agrupar eventos.
- Desenho: canvas redesenha todos os traços a cada movimento; replay decodifica
  novamente dentro do body; init recarrega rascunho durante reconstruções da
  view. Medir com desenhos densos e 10 participantes, cachear resultado
  decodificado e reduzir trabalho no main actor sem reduzir fidelidade.
- Slides: NSCache não tem limite explícito de custo, e cache miss faz leitura
  síncrona a partir da view. Aplicar orçamento de memória e preparar imagens
  fora do caminho de renderização. A validação anterior com sips no Mac não
  comprova UIImage/AVIF/WebP em todas as versões de iOS suportadas.
- Catálogos: perguntas/prendas usam índices de catálogos locais sem negociação
  de versão na sala. Adicionar verificação de compatibilidade/hashes para uma
  atualização web não fazer um app antigo mostrar outra pergunta no mesmo índice.
- Testes: acrescentar envelopes terminais, transição entre páginas, ação antiga
  chegando numa nova rodada, payload inválido e recuperação de sessão. Depois,
  executar partidas completas com host iOS e web, quatro participantes para
  desenho, background/foreground e troca Wi-Fi/5G. Não usar apenas a contagem
  de testes como critério de prontidão.

## Situação por jogo

| Jogo | Base presente | Principal pendência identificada |
| --- | --- | --- |
| Quem Erra, Paga | Perguntas, respostas, revelação, roleta, ranking | Vincular resposta à rodada e proteger compatibilidade dos catálogos |
| Advogado do Diabo | Teses, sorteio, preparação, apresentação, voto, nota | Vincular voto à rodada e validar reconexão durante as fases |
| Telefone Sem Fio | Canvas, rascunho, passagem, palpite, replay, ranking | Reenvio por passo, decoder robusto e confirmação correta da próxima página |
| Pitch no Escuro | Preparação, slides, voto, resultado | Sincronia sob latência e validação de assets em iOS real |

O iOS ainda não expõe replace_slides, que existe no backend e no cliente web.
O botão SKIP_SLIDE aparece no fluxo web local, mas não foi encontrada uma RPC
correspondente no backend atual; não presumir que basta conectar um botão Swift.

## Ordem recomendada

1. Encerramento/saída/restauração de sala e tratamento de autenticação.
2. Integridade das ações por rodada/passo e validação dos desenhos recebidos.
3. Confirmação dos controles de host, especialmente revelação.
4. Agendamento de fases, relógio e redução de chamadas redundantes.
5. Playtest misto com rede móvel e host nativo; em seguida refinamento visual.

Nenhuma nova tabela é necessária para os achados demonstrados. O item 2 pode
exigir evolução compatível das RPCs existentes. Build Release do simulador e
testes locais estão aprovados; prontidão multiplayer permanece pendente.
