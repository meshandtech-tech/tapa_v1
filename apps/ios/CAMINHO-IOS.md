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
2. **Quem Erra, Paga nativo — implementação auditada, playtest pendente.**
   iOS recebe perguntas, envia e confirma a alternativa, acompanha revelação,
   roleta/prenda, placar e retorno ao lobby. A roleta anima até o índice sorteado
   pelo Supabase; nunca sorteia localmente. Perguntas/alternativas preservam os
   índices do web. Espectadores tardios veem a partida, mas não respondem nem
   entram no placar. Envio duplicado, resposta não persistida e regras da
   pegadinha possuem testes automatizados; rede real e pausa ficam para o playtest.
3. **Camada funcional comum — implementada, playtest real pendente.**
   RPCs nativas para resposta, voto e contribuição; confirmações autoritativas;
   desenho compacto compatível com web; rascunho local; pedidos idempotentes
   de avanço; presença; restauração da última sala e limites de tempo para troca
   Wi-Fi/5G. Falta validar concorrência e recuperação em aparelhos reais.
4. **Advogado do Diabo — implementação nativa auditada, playtest pendente.**
   O host pode incluir até dez teses da casa sem apagar as demais configurações.
   A partida usa o mesmo conjunto de teses e a mesma ordem congelada do Supabase;
   roleta e caça-níquel apenas animam os vencedores oficiais. Preparação,
   apresentação, pausa, troca de tese, voto confirmado, avanço quando todos votam,
   nota e ranking seguem o ciclo web. Apresentador, espectador tardio e voto
   duplicado são bloqueados pelo servidor; o envio iniciado antes de background
   ganha uma janela curta para terminar. Identidade de tese usa `source:id` para
   impedir colisão entre catálogo oficial e tese personalizada.
5. **Telefone Sem Fio — implementação nativa auditada, playtest pendente.**
   Atribuição secreta, canvas nativo, rascunho por caderno/passo, envio
   idempotente de traços, palpite, passagem, revelação coletiva e ranking.
   Imagem é otimização: os traços aparecem imediatamente e permanecem como
   fallback se o Storage falhar. Uma atribuição ausente é rebuscada com espera
   progressiva e nunca vira falsamente “desenho enviado”. Pausa bloqueia novas
   contribuições; timeout aceita folha vazia para não travar a corrente; ordem
   de caderno e página usa as posições autoritativas do snapshot. O host ainda
   pode pular espera, controlar autoplay e aceitar um sinônimo como acerto.
6. **Pitch no Escuro — implementação nativa auditada, playtest pendente.**
   O sorteio anima exclusivamente o apresentador oficial da ordem congelada;
   preparação mostra só a ele o primeiro slide. Os cinco blocos de vinte
   segundos derivam do mesmo deadline do Supabase, inclusive durante pausa e
   reconexão, sem relógio ou índice paralelo no aparelho. Votação conta apenas
   participantes originais, exclui apresentador e espectador tardio, confirma
   no snapshot e preserva a média oficial. Os 32 IDs do catálogo correspondem
   aos 32 arquivos decodificáveis empacotados no app. O host vê quantos votos
   ainda faltam antes de fechar a rodada.
7. **Confiabilidade e integração — pendente.**
   Testar uma partida completa web + iOS, background/foreground, reconexão,
   troca Wi-Fi/5G e perda de evento Realtime. Não prometer prontidão com build apenas.
8. **Controles de host nativo — estrutura implementada, playtest pendente.**
   O iPhone cria a sala no mesmo Supabase do web, entra como host, monta o
   payload oficial dos quatro jogos, inicia/reinicia a partida e volta ao lobby.
   Avanços manuais usam compare-and-set no `advance_phase`; pausa, reroll de
   tese/prenda, autoplay/acerto manual da revelação e saídas de emergência
   continuam validados pelas RPCs existentes. No lobby, o host também troca
   jogo e dificuldade sem apagar outras configurações da sala.
   O catálogo nativo é exportado mecanicamente do conteúdo web para evitar duas
   listas divergentes. Nenhuma tabela ou migration nova foi necessária.

## Como acompanhar e retomar

Checkpoint de 2026-09-14: os quatro jogos possuem fluxo nativo de participante
e a primeira estrutura completa de host,
sempre renderizado pelo `room_snapshot`. Resposta, voto e contribuição só viram
sucesso depois da confirmação autoritativa. O desenho usa o formato compacto v2
do web, mantém rascunho local, envia os traços antes de qualquer imagem e aplica
a mesma comparação de respostas do servidor. Pitch pré-carrega os cinco slides.

Confiabilidade: tentativas de ação têm prazo curto e são idempotentes; snapshots,
entrada e presença também têm prazo; retorno do background fecha primeiro o socket
antigo; presença é renovada; a última sala é restaurada após relançar o app.

Verificação atual: **49 testes Swift passaram**, o projeto Xcode compilou para o
iPhone 17 Pro Simulator e abriu sem crash. Como proteção adicional, os **422
testes web** e o build Vite passaram sem nenhum arquivo web alterado. Ainda falta
a partida multiplayer completa web + iOS e a troca real Wi-Fi/5G; não declarar
produção pronta antes desse playtest.

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
