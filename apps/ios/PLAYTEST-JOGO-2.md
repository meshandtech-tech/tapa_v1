# Playtest iOS — Jogo 2: Advogado do Diabo

Estado: implementação nativa auditada; falta executar a partida multiplayer real.

## Preparação

1. Crie uma sala no iPhone e escolha **Advogado do Diabo**.
2. Troque a dificuldade e adicione duas **Teses da Casa**; apague uma delas.
3. Confirme no web que jogo, dificuldade e tese restante são os mesmos.
4. Entre no PIN com pelo menos mais duas pessoas, misturando iOS e web.

## Ciclo obrigatório

1. Inicie pelo iPhone e aceite a introdução pelo controle do host.
2. Confirme a roleta de teses em todos os clientes e a mesma tese revelada.
3. Em uma rodada, use **Trocar tese** e confirme que todos recebem a nova tese.
4. Confirme o caça-níquel e o mesmo apresentador em todos os aparelhos.
5. Confira os 50 segundos de preparação, contagem e 60 segundos de apresentação.
6. Durante uma apresentação, pause e retome pelo iPhone host.
7. Encerre uma apresentação antes do tempo e confirme que todos entram em votação.
8. O apresentador não pode votar; todos os outros veem a tese e as cinco notas.
9. Vote em todos menos um: o host deve mostrar quantos votos faltam.
10. Envie o último voto: a sala deve avançar uma única vez para a nota.
11. Confira a mesma média no web e no iPhone e avance ao próximo jogador.
12. Repita até todos apresentarem; confirme o ranking e o retorno ao lobby.

## Casos de confiabilidade

1. Ao enviar um voto, coloque o iPhone em background imediatamente. Ao voltar,
   o voto deve aparecer confirmado e o app não deve oferecer outro voto.
2. Tente tocar duas vezes rapidamente numa nota; apenas um voto deve existir.
3. Troque Wi-Fi por 5G durante a preparação e volte ao app. A fase e o relógio
   devem reconciliar com o Supabase, sem reiniciar a rodada.
4. Entre com outro aparelho no meio da partida. Ele deve assistir, não votar e
   não aparecer no ranking desta partida.
5. Feche e reabra o iOS durante uma rodada; ele deve restaurar a mesma sala e
   buscar o estado atual antes de continuar.

Se algo falhar, registre PIN, fase, rodada, aparelho, horário e screenshot.
