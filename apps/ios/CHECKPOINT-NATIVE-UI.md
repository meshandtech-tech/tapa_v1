# Checkpoint — 2026-09-13

Trabalho interrompido a pedido do usuário para retomar após reset do limite.
Este checkpoint NÃO é uma declaração de prontidão para produção.

## Implementado nesta rodada

- Identidade SwiftUI rosa/preto, cartões com bordas e sombras, componentes reutilizáveis.
- Entrada e lobby redesenhados no projeto existente.
- Roteamento pelo snapshot: lobby → Quem Erra, Paga; outros jogos exibem indisponibilidade nativa.
- Telas de introdução, pergunta, confirmação, revelação, prenda e placar.
- Catálogo JSON extraído dos arquivos web, preservando índices e alternativas.
- RPC submit_answer no serviço nativo; bloqueios locais de envio duplicado/pausa/espectador.
- Sincronização periódica de recuperação e conexão mantida nas trocas de fase.
- Nenhuma alteração em web, SQL, infraestrutura ou credenciais.
- Host continua no web: iniciar/avançar/reiniciar ainda não têm controles nativos.

## Verificação realizada

- swift test --package-path apps/ios com DEVELOPER_DIR do Xcode: 8 testes existentes passaram.
- TapaUI compilou para macOS no teste do pacote.
- Build iOS iniciado em /tmp/tapa-native-visual; não confirmado neste checkpoint.
- Ainda NÃO verificado visualmente no Simulator nem em partida real web/iOS.

## Retomada prioritária

1. Revisar confirmação de resposta: submit_answer retorna void e pode fazer no-op.
   O sucesso HTTP sozinho não comprova persistência. Confirmar pelo snapshot/answers
   antes de mostrar sucesso; testar timeout, erro e troca de rodada durante request.
2. Conferir contratos atuais de room_snapshot_internal (answers/me.submitted) e
   catalogação de perguntas contra o web. Adicionar teste/script de paridade do catálogo.
3. Adicionar testes específicos para envio, fases, espectador, pausa, relógio do servidor,
   snapshots fora de ordem, background/foreground e reconexão.
4. Concluir build iOS com assinatura normal, sem desabilitar code signing.
5. Inspecionar visualmente entrada/lobby/pergunta/resultados no Simulator.
6. Testar host web + jogador iOS do lobby ao placar e retorno ao lobby.
7. Revisar ciclo de vida das tasks e desempenho do polling antes de considerar pronto.

Repositório: /Users/nickgaldino/Desktop/WORK/tapa_v1/JOGOS_TAPA
Projeto: apps/ios/Tapa.xcodeproj
Não criar outro projeto, não modificar produção web, não versionar Secrets.xcconfig.
