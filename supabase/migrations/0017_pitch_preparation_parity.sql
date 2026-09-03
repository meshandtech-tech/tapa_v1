-- Pitch no Escuro: o produto, a instrução e o registry definem 20 segundos de
-- preparação, mas o seed histórico do banco ficou em 30. O servidor é quem
-- cria o deadline, portanto a divergência aparecia diretamente no cronômetro.
-- Alinha o dado autoritativo sem alterar nenhuma outra fase do jogo.

update phase_config
   set duration_ms = 20000,
       next_phase = 'COUNTDOWN'
 where game_id = 'improv-slides'
   and phase = 'PREPARATION';
