# Audit de produção e jogabilidade — Tapa

Iniciado em 2026-09-02. Este documento registra evidência e decisões; não
redefine as regras dos jogos.

## Modelo do audit

Cada etapa recebe um dos três resultados:

- **READY:** passou nos critérios e pode seguir para o próximo jogo.
- **READY COM AÇÃO:** funciona, mas há uma ação operacional obrigatória.
- **NOT READY:** existe P0/P1 capaz de parar a festa, misturar salas, perder
  uma jogada ou deixar jogadores presos.

Cada sala e cada jogo são avaliados pelas mesmas seis lentes:

1. **Ciclo:** estados, entradas, saídas e autoridade de cada transição.
2. **Integridade:** entrega única, ordem, pontuação e convergência entre telas.
3. **Isolamento:** uma sala e um jogador não interferem nos demais.
4. **Resiliência:** F5, segundo plano, troca Wi-Fi/5G, queda do host e retry.
5. **Performance:** latência RPC p50/p95/p99, erro/retry, tamanho e volume de
   Realtime, Storage e tempo de resposta percebido.
6. **Diversão:** instrução clara, feedback imediato, pouca espera morta,
   participação do grupo e ritmo coerente com a piada do jogo.

Um teste verde só vale quando afirma o que a pessoa vê. “A RPC não deu erro”
não prova que a tela recebeu e apresentou o dado correto.

## Ordem

1. Criação, entrada, lobby, reconexão e encerramento da sala.
2. Telefone Sem Fio — maior concorrência, segredo individual e Storage.
3. Quem Erra, Paga — resposta, revelação, roleta e placar.
4. Advogado do Diabo — sorteios, apresentação, voto e ritmo coletivo.
5. Pitch no Escuro — slides, apresentador, temporização e votação.
6. Ensaio final: seis salas simultâneas com dez pessoas.

## Fase 1 — sala e conexão

### Arquitetura encontrada

- Postgres é a autoridade; o host é uma permissão em `rooms`, não o servidor.
- Realtime transmite apenas mudanças pequenas de `rooms`, `matches` e
  `players`; o cliente recupera o estado com `room_snapshot`.
- A sessão anônima persistida mantém a identidade no F5 e na troca de rede.
- Presença é atualizada a cada 15 segundos enquanto a aba está visível.
- Reconexão usa backoff e sempre termina buscando um snapshot novo.
- O comando do host pode passar para outro membro após 30 segundos sem
  presença; o lock do banco escolhe apenas um sucessor.

### Schema

As 11 tabelas atuais são suficientes:

`rooms`, `players`, `matches`, `chains`, `contributions`, `match_topics`,
`votes`, `answers`, `phase_config`, `game_rules` e `profiles`.

Não adicionar tabela agora. As views de métricas já derivam partidas,
conclusão e confiabilidade dos dados autoritativos. Uma tabela de eventos no
caminho crítico criaria mais escrita sem corrigir nenhum risco atual. Se o
produto precisar de analytics detalhado depois, eventos devem ser enviados de
forma assíncrona e fora das transações do jogo.

### Evidência medida

- Navegador público: criação, entrada de host, entrada de convidado, roster em
  tempo real, reload do convidado e encerramento passaram já com o RLS novo.
- Queda do host: outro membro assumiu após 31 segundos e encerrou a sala.
- Carga depois do hardening: 6 salas × 10 sessões, 5.421 RPCs, uma tentativa
  transitória recuperada (0,02%), zero erro persistente e seis jogos
  concluídos.
- Média ponderada de RPC: 99,6 ms; pior p95: 336,0 ms; pior p99: 672,9 ms.
- Maior evento individual de Realtime: 1,5 kB.
- Teste mais recente do desenho: 1.680 RPCs, média 114,3 ms, p95 336,0 ms,
  p99 672,9 ms e zero erro/retry.
- Criação controlada em produção: 74–256,6 ms.
- Capacidade concorrente: 10 de 11 entradas aceitas; a décima primeira recebeu
  `room_full` e o roster permaneceu exatamente com 10.
- Storage: primeiro upload e retry com `upsert` passaram; URL pública respondeu
  HTTP 200 com os bytes esperados.
- Suite: 359 testes e build de produção verdes.

### P0/P1 encontrados e resolvidos

- Colisão de PIN agora reserva outro código e preserva a sala anterior.
- `resolve_room` substituiu a enumeração de salas abertas.
- Um membro recebe `room_forbidden` ao pedir snapshot de outra sala.
- Entradas são serializadas com lock na sala; capacidade não pode ser furada.
- RPCs internas não têm permissão de execução pelo cliente.
- `advance_phase` exige membro e `replace_slides` exige host.
- Storage aceita o retry idempotente de upload com `upsert`.
- O limite de Auth anônimo foi ajustado para 3.600/hora por IP.

### Capacidade do Supabase

Supabase é suficiente para o alvo atual. Mesmo o limite Free documentado de
200 conexões Realtime simultâneas comporta as 60 sessões previstas. O desenho
fica no Storage e não passa pelo WebSocket, e o teste real ficou muito abaixo
do limite de payload.

O risco operacional é Auth: login anônimo tem limite padrão de 30 criações por
hora por IP e bucket de rajada 30. Para 60 aparelhos novos no mesmo Wi-Fi,
ajustar `rate_limit_anonymous_users` no painel é obrigatório; o retry com jitter
do cliente absorve a reposição gradual, mas não substitui a configuração.

Referências oficiais:

- https://supabase.com/docs/guides/realtime/limits
- https://supabase.com/docs/guides/auth/rate-limits
- https://supabase.com/docs/guides/auth/auth-anonymous
- https://supabase.com/docs/guides/storage/security/access-control

### Gate atual

**READY.** Criação, entrada, isolamento, capacidade, reconexão, sucessão de
host, Storage e carga de 60 sessões passaram em produção.

Próxima etapa: auditar o Telefone Sem Fio sem alterar seu ciclo de jogo.

## Fase 2 — Telefone Sem Fio

### Ciclo respeitado

`GAME_INTRO → DRAW_STEP → PASSING → GUESS_STEP → PASSING → … →`
`REVEAL_INTRO → REVEAL_PAGE → GAME_OVER`.

- `seat_order` é congelada no início e o caderno roda por aritmética; F5 não
  muda o caderno recebido.
- Cada pessoa vê somente a página imediatamente anterior que precisa
  interpretar. Cadernos completos só aparecem na revelação.
- Desenho é registrado primeiro como traços no Postgres; o upload melhora a
  página depois, sem segurar a entrega nem a transição.
- A imagem é anexada ao `stepIndex` original do canvas mesmo quando todos
  enviam juntos e a fase avança antes do fim do upload.
- Entrega duplicada é idempotente pela unique `(match, step, player)`.
- Quem cai vira página `missed` pelo backfill, sem criar buraco ou travar os
  outros cadernos.

### Evidência de produção

- 10 sessões e 10 WebSockets completaram todos os 10 passos.
- 10 cadernos × 10 páginas; zero buraco e zero autor duplicado.
- Upload e `attach_drawing` passaram; reconexão no meio da partida voltou.
- 1.680 RPCs, zero erro/retry, média 114,3 ms, p95 336,0 ms e p99 672,9 ms.
- Maior evento Realtime: 1,5 kB; tráfego total máximo: 198,9 kB por cliente.
- Os três `missed` do teste foram provocados pela queda deliberada de uma
  sessão; o jogo preencheu as páginas e chegou a `GAME_OVER`.
- Quatro navegadores reais desenharam em canvases 440 × 440 e enviaram na
  primeira rodada. Na rodada de palpite, os quatro receberam imagens de
  1.024 px completamente carregadas; zero folha em branco.
- A UI mostrou palavra secreta, ferramentas, timer e envio no desenho; depois
  mostrou somente imagem e campo de palpite, sem revelar autoria ou texto.

### Ritmo e diversão

- Todos jogam ao mesmo tempo; não existe fila de espera por apresentador.
- Quando todos entregam, o banco é avisado imediatamente e a sala não espera
  o restante dos 90/60 segundos.
- `PASSING` de 1,2 segundo comunica a troca de caderno sem criar tempo morto.
- Em 10 jogadores, o teto antes da revelação é aproximadamente 12,8 minutos
  se todas as fases consumirem o prazo inteiro; durante esse tempo todos estão
  desenhando ou tentando adivinhar.
- A revelação é o payoff coletivo e continua sob controle do host. No playtest
  humano, medir apenas se o grupo quer acelerar as últimas correntes; não
  alterar o ciclo antes dessa evidência.

### Gate

**READY técnico.** O ciclo completo, a concorrência, o segredo, o Storage, a
segunda rodada, a reconexão e a revelação passaram. O único item subjetivo é
observar o ritmo da revelação no playtest humano; isso não bloqueia a festa.

Próxima etapa: Quem Erra, Paga.

## Fase 3 — Quem Erra, Paga

### Ciclo respeitado

`GAME_INTRO → ROUND_ACTIVE → REVEAL_ANSWER → FORFEIT_WHEEL? →`
`LEADERBOARD → próxima pergunta ou GAME_OVER`.

- Cada `(match, round, player)` aceita uma única resposta; não é possível
  trocar depois de enviar nem pontuar duas vezes por retry.
- Durante a pergunta, o snapshot revela somente quem respondeu. A alternativa
  dos outros chega mascarada e a resposta certa só aparece na revelação.
- Resposta ausente e alternativa errada contam como erro; nas pegadinhas,
  corretamente ninguém ganha ponto.
- Pontuação e sorteio da prenda são decididos no servidor. O host só controla
  quando a prenda terminou e o grupo pode seguir.
- A saída do host não prende a roleta: a sucessão de host já validada na Fase 1
  preserva a partida e transfere o botão de continuar.

### Problema de ritmo encontrado e resolvido

O Supabase já permitia terminar `ROUND_ACTIVE` quando todos respondiam, mas o
cliente cloud só chamava `advance_phase` antes do prazo no Telefone Sem Fio.
Na prática, dois navegadores responderam e continuaram olhando a pergunta até
o relógio acabar, mesmo depois de a TV informar “Todo mundo respondeu”.

O cliente agora reconhece as chaves das respostas mascaradas dos participantes
congelados em `seat_order`, espera 0,5 segundo para mostrar a confirmação do
último toque e avisa o banco. O servidor continua validando a conclusão e seu
compare-and-set continua descartando chamadas concorrentes. Prazo máximo,
perguntas, respostas, pontuação, revelação e roleta não foram alterados.

### Evidência de produção

- Dois navegadores reais responderam a mesma pergunta; da última resposta até
  a revelação foram 1.223 ms, medidos dentro do navegador, com zero erro de
  página e zero erro no console.
- A pergunta seguinte era uma pegadinha; ambos foram classificados como erro,
  a prenda apareceu e o controle voltou corretamente ao host.
- Duas salas de quiz com 10 sessões cada chegaram a `GAME_OVER` no ensaio
  concorrente de 60 clientes.
- Sala A: 300 RPCs, média 106,5 ms, p95 239,1 ms e p99 387,4 ms.
- Sala B: 300 RPCs, média 109,0 ms, p95 263,0 ms e p99 325,3 ms.
- Os testes cobrem resposta única, limpeza entre rodadas, prazo, pegadinha,
  pontuação e roleta. A suíte completa passou com 364 testes após o ajuste.

### Ritmo e diversão

- Todos respondem ao mesmo tempo e recebem confirmação imediata no celular.
- Quem precisa dos 30 segundos continua tendo os 30 segundos; grupos rápidos
  não ficam presos ao tempo máximo.
- A revelação de 6 segundos dá espaço para reação, o placar de 7 segundos
  ancora a competição e a roleta espera a prenda acontecer de verdade.
- No playtest humano, observar se dez perguntas ficam longas para o perfil da
  festa. Não reduzir o baralho sem evidência: a espera morta já foi removida.

### Gate

**READY técnico.** Resposta simultânea, segredo, avanço antecipado, revelação,
pontuação, pegadinha, roleta, troca de host e encerramento passaram.

Próxima etapa: Advogado do Diabo.
