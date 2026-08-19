import { useEffect, useRef, useState } from "react";
import { activeSlides, preloadSlides } from "./library";
import { pickSlides } from "./slides";

/**
 * Garante que os cinco slides estejam na memória antes da preparação.
 *
 * Roda na janela entre o sorteio e a preparação — o PLAYER_SPIN e o
 * PLAYER_REVEAL somam uns oito segundos, e é de propósito: quando o relógio de
 * 20 segundos começa, não há mais nada para baixar.
 *
 * Se alguma imagem falhar, quem tem o comando troca a imagem AGORA, antes de
 * alguém apresentar. Descobrir arquivo quebrado no meio da fala de alguém era
 * justamente o que não podia acontecer.
 */
export function useSlidePreload(
  slideIds: readonly string[],
  isAuthority: boolean,
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
      if (failed.length === 0 || !isAuthority || jaTrocou.current === chave) return;

      // Uma tentativa por sorteio: se a substituta também falhar, o jogo segue
      // com o quadro de "slide indisponível" em vez de tentar para sempre.
      jaTrocou.current = chave;
      const pool = activeSlides.map((slide) => slide.id);
      const bons = slideIds.filter((id) => !failed.includes(id));
      const reservas = pickSlides(
        pool.filter((id) => !bons.includes(id)),
        [],
        failed.length,
      );
      if (reservas.length > 0) onReplace([...bons, ...reservas]);
    });

    return () => { cancelado = true; };
  }, [slideIds.join("|"), isAuthority, onReplace]);

  return pronto;
}
