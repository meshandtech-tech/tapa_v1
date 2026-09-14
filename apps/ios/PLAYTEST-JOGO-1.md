# Playtest iOS — Jogo 1: Quem Erra, Paga

Estado: implementação nativa auditada; falta executar o teste multiplayer real.

## Preparação

1. Abra o TAPA nativo no iPhone ou Simulator.
2. Informe um nome, escolha **Quem Erra, Paga** e crie a sala.
3. Entre no mesmo PIN pelo web com pelo menos mais uma pessoa.
4. Confirme que o iPhone aparece como host e que todos aparecem no lobby.

## Ciclo obrigatório

1. Inicie pelo iPhone e confirme a introdução nos dois clientes.
2. Em uma pergunta, responda alternativas diferentes nos dois aparelhos.
3. Confirme que cada aparelho trava apenas a própria resposta e mostra a letra marcada.
4. Deixe uma pergunta sem resposta em um aparelho; ele deve contar como erro.
5. Numa pegadinha, confirme que todos erram mesmo escolhendo alternativas diferentes.
6. Confira a resposta revelada e os mesmos pontos no web e no iPhone.
7. Quando houver erro, confirme que a roleta gira e para na mesma prenda em todos.
8. Use **Girar outra prenda** e confirme que o resultado muda sem sair da fase.
9. Use **Todo mundo pagou, continuar** e siga até o placar.
10. No fim, teste **Jogar de novo** e **Escolher outro jogo**.

## Rede e reconexão

1. Durante uma pergunta, envie a resposta e imediatamente coloque o app em background.
2. Volte ao app e confirme que a resposta aparece registrada, sem permitir duplicata.
3. Pause pelo host, troque Wi-Fi por 5G, volte ao app e retome a partida.
4. Entre com um terceiro aparelho no meio da partida: ele deve assistir, não responder
   e não aparecer no placar desta partida.

Se qualquer etapa falhar, registrar: PIN, fase, rodada, aparelho, horário e screenshot.
