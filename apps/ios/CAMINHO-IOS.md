# TAPA nativo — caminho de implementação

Atualizado: 2026-09-14.

## Objetivo

Levar a identidade e a jogabilidade do TAPA para SwiftUI, no projeto
existente Tapa.xcodeproj. O iPhone participa das mesmas salas do web.
Não estamos criando outro jogo nem substituindo a versão web.

## Limites de segurança

- Manter web e contratos de produção intactos.
- Supabase continua autoritativo para fases, respostas e pontos.
- Nunca interpretar sucesso HTTP como prova de resposta registrada:
  submit_answer pode retornar sem inserir. Confirmar via snapshot.answers.
- Não versionar credenciais, Secrets.xcconfig ou arquivos .env.
- Não publicar nem aplicar migrations como efeito colateral do desenvolvimento iOS.
- Commits de checkpoint podem conter trabalho incompleto; não significam produção pronta.

## Etapas e critérios de conclusão

1. **Base visual e navegação — implementada, validação visual pendente.**
   Componentes SwiftUI reutilizáveis; entrada, lobby e roteamento por fase.
   Conferir telas pequenas, teclado, textos longos e acessibilidade.
2. **Quem Erra, Paga como participante — em implementação.**
   Host no web; iOS recebe perguntas, envia alternativa, acompanha revelação,
   prenda, placar e retorno ao lobby. Perguntas/alternativas preservam índices do web.
   Validar envio duplicado, resposta não persistida, falha de rede, pausa e espectador.
3. **Confiabilidade e integração — pendente.**
   Testar uma partida completa web + iOS, background/foreground, reconexão,
   troca Wi-Fi/5G e perda de evento Realtime. Não prometer prontidão com build apenas.
4. **Outros jogos — depois do primeiro ciclo validado.**
   Auditar individualmente regras e fases do web antes de portar cada jogo.
   Não inventar ciclos novos. Atualmente o app informa indisponibilidade nativa.
5. **Controles de host nativo — etapa posterior.**
   Criação/início/avanço/reinício no iOS precisam de implementação e testes próprios.
   Nesta entrega, o host permanece no navegador.

## Como acompanhar e retomar

Checkpoint de 2026-09-14: confirmação do quiz agora usa snapshot.answers,
sem confirmação otimista pelo retorno void da RPC. Os 11 testes passaram,
incluindo no-op do servidor, persistência seguida de falha de transporte
e índice da pergunta pegadinha. Build iOS, inspeção visual e playtest
multiplayer continuam pendentes; não declarar a etapa 2 concluída.

- Histórico de commits: checkpoints recuperáveis de cada etapa.
- CHECKPOINT-NATIVE-UI.md: contexto e pendências da primeira entrega.
- Este documento: direção, escopo e critérios de conclusão.
- Executar swift test --package-path apps/ios usando o DEVELOPER_DIR do Xcode.
- Build iOS com assinatura normal; depois inspeção no Simulator e playtest real.

## Créditos e pausa

O agente não tem acesso ao percentual de usage limit. Não pode detectar os 10%.
Salvar commits ao concluir etapas; se o usuário avisar que chegou ao limite,
registrar pendências, fazer checkpoint e pausar. Push somente quando solicitado.
