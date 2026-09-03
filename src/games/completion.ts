import { everyoneAnswered } from "./quemErraPaga";
import { everyoneSubmitted } from "./drawing/state";
import { DRAWING_TELEPHONE_CONFIG } from "./drawing/config";
import type { PartyState } from "../party/types";

/**
 * Dá para fechar a fase antes do prazo?
 *
 * Existe porque a autoridade não deveria conhecer as regras de cada jogo. A
 * versão anterior tinha `ROUND_ACTIVE` e `everyoneAnswered` escritos dentro do
 * hook, o que significava que qualquer jogo novo com "espera todo mundo"
 * precisava mexer no motor da sala em vez de só se declarar aqui.
 */
export function phaseCompleteEarly(state: PartyState): boolean {
  switch (state.settings.gameId) {
    case "drawing-telephone":
      if (state.phase !== "DRAW_STEP" && state.phase !== "GUESS_STEP") return false;
      return !!state.drawing && everyoneSubmitted(state.drawing);
    default:
      return state.phase === "ROUND_ACTIVE" && everyoneAnswered(state);
  }
}

/**
 * Folga entre o prazo vencer e a autoridade dar a fase por encerrada.
 *
 * Só o desenho precisa: o traço já estava pronto, mas subir a imagem leva um
 * tempo que o wi-fi do bar não garante. Sem esta folga, um desenho feito
 * inteiro viraria página em branco por causa de meio segundo de rede.
 */
export function submitGrace(state: PartyState): number {
  if (state.settings.gameId !== "drawing-telephone") return 0;
  if (state.phase !== "DRAW_STEP" && state.phase !== "GUESS_STEP") return 0;
  return DRAWING_TELEPHONE_CONFIG.submitGraceMs;
}
