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
  tempo real, reload do convidado e encerramento passaram.
- Queda do host: outro membro assumiu após 31 segundos e encerrou a sala.
- Carga já executada: 6 salas × 10 sessões, 5.420 RPCs, zero erro persistente,
  zero retry e seis jogos concluídos.
- Pior p95 de RPC: 560,5 ms; pior p99: 917,2 ms.
- Maior evento individual de Realtime: 1,5 kB.
- Teste mais recente do desenho: 1.680 RPCs, média 137,2 ms, p95 252,9 ms,
  p99 626,4 ms e zero erro/retry.
- Criação controlada em produção: 74–256,6 ms.
- Suite: 359 testes e build de produção verdes.

### P0/P1 encontrados

Produção ainda não recebeu a migration `0014_party_isolation.sql`:

- criar outra sala com o mesmo PIN fecha a sala anterior;
- um membro de uma sala consegue pedir `room_snapshot` de outra sala se souber
  o UUID;
- entradas simultâneas ainda não estão serializadas pela linha da sala;
- `replace_slides` ainda não valida host no banco.

O teste público confirmou a versão antiga: `resolve_room` ainda não existe,
uma colisão fechou a primeira sala e o snapshot cruzado foi devolvido.

Também falta aplicar a policy de `UPDATE` de `supabase/storage.sql`, necessária
para o retry idempotente de upload com `upsert`.

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

**NOT READY**, somente porque o hardening pronto ainda não foi aplicado ao
Supabase de produção.

Para fechar a fase 1:

1. Aplicar `supabase/migrations/0014_party_isolation.sql` no SQL Editor.
2. Aplicar `supabase/storage.sql` no SQL Editor.
3. Ajustar o limite de usuários anônimos para a entrada concentrada da festa.
4. Repetir colisão, isolamento, capacidade concorrente, 6 × 10 conexões e
   reconexão de host.
5. Marcando READY, iniciar o Telefone Sem Fio sem alterar seu ciclo de jogo.
