-- Uma contribuição vale uma página inteira do caderno. Em rede móvel, três
-- segundos não bastavam para o auto-envio receber ACK e tentar outra conexão:
-- `advance_phase` criava `missed`, e o próximo jogador via "Folha em branco".
--
-- Dez segundos só são usados quando ainda falta alguém. Se todos entregaram,
-- `all_submitted` continua avançando a fase imediatamente, sem mudar o ritmo
-- normal do jogo.
create or replace function submit_grace_ms(p_game text, p_phase text)
returns int language sql immutable as $$
  select case
    when p_game = 'drawing-telephone' and p_phase in ('DRAW_STEP','GUESS_STEP')
      then 10000 else 0 end;
$$;
