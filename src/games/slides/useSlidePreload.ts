import { useEffect, useRef, useState } from "react";
import { activeSlides, preloadSlides } from "./library";
import { replaceFailedSlides } from "./slides";

/**
 * Garante que os cinco slides estejam na memória antes da apresentação.
 *
 * Começa na janela entre o sorteio e a preparação — o PLAYER_SPIN e o
 * PLAYER_REVEAL somam uns oito segundos. Em rede móvel muito lenta, ainda pode
 * concluir durante a preparação; a troca continua segura até o COUNTDOWN.
 *
 * Se alguma imagem falhar, quem tem o comando troca a imagem AGORA, antes de
 * alguém apresentar. Descobrir arquivo quebrado no meio da fala de alguém era
 * justamente o que não podia acontecer.
 */
export function useSlidePreload(
  slideIds: readonly string[],
  canReplaceSlides: boolean,
  onReplace: (ids: string[]) => void,
): boolean {
  const [pronto, setPronto] = useState(false);
  const jaTrocou = useRef<string>("");

  useEffect(() => {
    if (slideIds.length === 0) {
      setPronto(false);
      return;
    }
    let cancelado = false;
    const chave = slideIds.join("|");
    setPronto(false);

    void preloadSlides(slideIds).then(({ failed }) => {
      if (cancelado) return;
      setPronto(true);
      if (failed.length === 0 || !canReplaceSlides || jaTrocou.current === chave) return;

      // Uma tentativa por sorteio: se a substituta também falhar, o jogo segue
      // com o quadro de "slide indisponível" em vez de tentar para sempre.
      jaTrocou.current = chave;
      const pool = activeSlides.map((slide) => slide.id);
      const substituidos = replaceFailedSlides(slideIds, failed, pool);
      if (substituidos) onReplace(substituidos);
    });

    return () => { cancelado = true; };
  }, [slideIds.join("|"), canReplaceSlides, onReplace]);

  return pronto;
}
