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

1. **Base visual e navegação — suficiente para testes, refinamento adiado.**
   Componentes SwiftUI reutilizáveis; entrada, lobby e roteamento por fase.
   Conferir telas pequenas, teclado, textos longos e acessibilidade.
2. **Quem Erra, Paga como participante — implementado, playtest pendente.**
   Host no web; iOS recebe perguntas, envia alternativa, acompanha revelação,
   prenda, placar e retorno ao lobby. Perguntas/alternativas preservam índices do web.
   Validar envio duplicado, resposta não persistida, falha de rede, pausa e espectador.
3. **Camada funcional comum — implementada, playtest real pendente.**
   RPCs nativas para resposta, voto e contribuição; confirmações autoritativas;
   desenho compacto compatível com web; rascunho local; pedidos idempotentes
   de avanço; presença; restauração da última sala e limites de tempo para troca
   Wi-Fi/5G. Falta validar concorrência e recuperação em aparelhos reais.
4. **Advogado do Diabo — estrutura participante implementada, playtest pendente.**
   Roleta/tema/apresentador, preparação, apresentação, voto confirmado,
   revelação de nota e ranking.
5. **Telefone Sem Fio — estrutura participante implementada, playtest pendente.**
   Atribuição secreta, canvas nativo, rascunho, envio repetível de traços,
   palpite, passagem, revelação e ranking. Imagem é otimização; traços protegem a página.
6. **Pitch no Escuro — estrutura participante implementada, playtest pendente.**
   Sorteio, preparação, slides reais do acervo, temporização derivada do prazo,
   votação confirmada, nota e ranking.
7. **Confiabilidade e integração — pendente.**
   Testar uma partida completa web + iOS, background/foreground, reconexão,
   troca Wi-Fi/5G e perda de evento Realtime. Não prometer prontidão com build apenas.
8. **Controles de host nativo — etapa posterior.**
   Criação/início/avanço/reinício no iOS precisam de implementação e testes próprios.
   Nesta entrega, o host permanece no navegador.

## Como acompanhar e retomar

Checkpoint de 2026-09-14: os quatro jogos possuem fluxo nativo de participante,
sempre renderizado pelo `room_snapshot`. Resposta, voto e contribuição só viram
sucesso depois da confirmação autoritativa. O desenho usa o formato compacto v2
do web, mantém rascunho local, envia os traços antes de qualquer imagem e aplica
a mesma comparação de respostas do servidor. Pitch pré-carrega os cinco slides.

Confiabilidade: tentativas de ação têm prazo curto e são idempotentes; snapshots,
entrada e presença também têm prazo; retorno do background fecha primeiro o socket
antigo; presença é renovada; a última sala é restaurada após relançar o app.

Verificação deste checkpoint: **23 testes Swift passaram**, build do app para o
iPhone 17 Pro Simulator passou e o app abriu sem crash. Como proteção adicional,
os **422 testes web** e o build Vite passaram mesmo sem nenhum arquivo web alterado.
Ainda falta a partida multiplayer completa web + iOS e a troca real Wi-Fi/5G;
não declarar produção pronta antes desse playtest.

## Ordem de prioridade decidida

1. Contratos e funcionamento do backend iOS.
2. Jogabilidade e recuperação em rede ruim.
3. Transcrição jogo por jogo e lógica por lógica.
4. Playtests e correções.
5. Refinamento visual final.

As telas nunca criam uma segunda autoridade. O fluxo é:

Ação no iPhone → RPC de intenção → Postgres valida → room_snapshot confirma → SwiftUI renderiza.

- Histórico de commits: checkpoints recuperáveis de cada etapa.
- CHECKPOINT-NATIVE-UI.md: contexto e pendências da primeira entrega.
- Este documento: direção, escopo e critérios de conclusão.
- Executar swift test --package-path apps/ios usando o DEVELOPER_DIR do Xcode.
- Build iOS com assinatura normal; depois inspeção no Simulator e playtest real.

## Créditos e pausa

O agente não tem acesso ao percentual de usage limit. Não pode detectar os 10%.
Salvar commits ao concluir etapas; se o usuário avisar que chegou ao limite,
registrar pendências, fazer checkpoint e pausar. Push somente quando solicitado.
