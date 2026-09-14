# Playtest iOS — Jogo 3: Telefone Sem Fio

Estado: implementação nativa auditada; falta executar uma partida multiplayer real.

## Preparação

1. Crie no iPhone uma sala de **Telefone Sem Fio**.
2. Entre no mesmo PIN com pelo menos mais três pessoas; misture iOS e web.
3. Confirme os quatro jogadores no lobby. O jogo não deve iniciar com menos de quatro.
4. Comece pelo host nativo e aguarde a palavra secreta individual de cada aparelho.

## Corrente obrigatória

1. Todos desenham a própria palavra e enviam. Nenhum aparelho deve mostrar o
   tema, desenho ou palpite de outra pessoa antes da hora.
2. Confirme que quem entregou vê o progresso da mesa e não consegue enviar duas vezes.
3. Na passagem, todos devem ver o respiro curto e receber outro caderno sem trocar celular.
4. No palpite, confirme que aparece somente o desenho anterior e um campo de até 60 caracteres.
5. Continue alternando desenho e palpite até todos os passos terminarem.
6. Na revelação, confira para cada caderno: tema original, uma página por passo,
   autoria correta e confronto final. Todos os aparelhos devem mostrar a mesma página.
7. Em um sinônimo correto que a comparação não reconheça, use **Conta como acerto**.
8. Ative e pause o avanço automático; confirme que nenhuma página é pulada.
9. Finalize todos os cadernos e confira um ponto apenas para cada palavra que sobreviveu.

## Falhas que precisamos provocar

1. Faça um desenho, troque imediatamente o app para background e volte. Os traços
   devem estar confirmados ou continuar no rascunho com opção de tentar novamente.
2. Pause durante desenho e palpite. Não deve ser possível alterar ou enviar a contribuição.
3. Deixe um aparelho sem enviar e use **Pular a espera**. A corrente deve continuar
   com página vazia, nunca ficar presa.
4. Troque Wi-Fi por 5G durante um envio e confirme que a página reaparece pelos traços,
   mesmo se a imagem do Storage não carregar.
5. Entre com um quinto aparelho depois de começar. Ele acompanha o progresso e a
   revelação, mas não recebe caderno nem entra no placar desta partida.
6. Feche e reabra o iOS no meio de um desenho. O rascunho daquela tarefa deve voltar.

Se algo falhar, registre PIN, passo, tipo da fase, aparelho, horário e screenshots
do aparelho que enviou e do aparelho que recebeu a página seguinte.
