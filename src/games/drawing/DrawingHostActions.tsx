import { memo } from "react";
import { Check, ChevronRight, Pause, Play, SkipForward, ThumbsUp } from "lucide-react";
import type { HostCommand } from "../../party/channel";
import type { PartyState } from "../../party/types";
import { Button } from "../../ui/Button";
import { chainSurvived, comparisonPageIndex } from "./state";

/**
 * Os botões do host no jogo de desenho, no celular dele.
 *
 * Durante o desenho e o palpite quase não há botão: a partida corre sozinha e
 * o host é jogador como os outros — ficar apertando "próximo" a cada rodada o
 * tiraria do jogo. O que sobra é uma saída de emergência, discreta.
 *
 * Na revelação é o contrário: o ritmo tem de ser humano, então cada página
 * espera um toque. O auto-play existe porque com 10 cadernos isso vira mais de
 * cem toques, e ninguém deveria virar projecionista da própria festa.
 */
function DrawingHostActionsBase({
  state,
  send,
}: {
  state: PartyState;
  send: (command: HostCommand) => void;
}) {
  const drawing = state.drawing;
  if (!drawing) return null;

  const conteudo = (() => {
    switch (state.phase) {
      case "GAME_INTRO":
        return (
          <Button size="md" variant="solid" className="w-full" onClick={() => send({ type: "ADVANCE" })}>
            <Check strokeWidth={3} className="size-6" />
            Bora desenhar
          </Button>
        );

      // Saída de emergência: o passo já fecha sozinho quando todos entregam ou
      // o prazo vence. Só serve para destravar um aparelho que sumiu.
      case "DRAW_STEP":
      case "GUESS_STEP":
        return (
          <Button size="sm" variant="paper" className="w-full" onClick={() => send({ type: "ADVANCE" })}>
            <SkipForward strokeWidth={3} className="size-5" />
            Pular a espera
          </Button>
        );

      case "REVEAL_INTRO":
        return (
          <Button size="md" variant="solid" className="w-full" onClick={() => send({ type: "ADVANCE" })}>
            <Play strokeWidth={3} className="size-6" />
            Começar a revelação
          </Button>
        );

      case "REVEAL_PAGE": {
        const chain = drawing.chains[drawing.revealChainIndex];
        const noConfronto = drawing.revealPageIndex === comparisonPageIndex(drawing.stepCount);
        // Só oferece bancar o palpite quando ele NÃO casou sozinho — oferecer
        // sempre convidaria a dar ponto de graça.
        const podeBancar = noConfronto && !!chain && !chainSurvived(chain, drawing.manualMatches);

        return (
          <div className="flex flex-col gap-2">
            {podeBancar ? (
              <Button
                size="sm"
                variant="paper"
                className="w-full"
                onClick={() => send({ type: "COUNT_AS_MATCH", chainId: chain.id })}
              >
                <ThumbsUp strokeWidth={3} className="size-5" />
                Valeu, conta como acerto
              </Button>
            ) : null}

            <div className="flex gap-2">
              <Button
                size="md"
                variant="solid"
                className="flex-1"
                onClick={() => send({ type: "ADVANCE" })}
              >
                <ChevronRight strokeWidth={3} className="size-6" />
                Próxima
              </Button>
              <Button
                size="md"
                variant="knockout"
                aria-label={drawing.revealAutoPlay ? "Pausar avanço automático" : "Avançar sozinho"}
                onClick={() =>
                  send({ type: "SET_REVEAL_AUTOPLAY", autoPlay: !drawing.revealAutoPlay })
                }
              >
                {drawing.revealAutoPlay ? (
                  <Pause strokeWidth={3} className="size-6" />
                ) : (
                  <Play strokeWidth={3} className="size-6" />
                )}
              </Button>
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  })();

  if (!conteudo) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center border-t-4 border-ink
                 bg-accent px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
    >
      <div className="w-full max-w-md">{conteudo}</div>
    </div>
  );
}


/**
 * Memoizado de propósito.
 *
 * O relógio da sala re-renderiza a tela do host 4x por segundo. Sem esta
 * barreira, cada tique reconstruía também os controles — na mesma tela que já
 * carrega o jogo inteiro e, antes, serializava o estado da partida. Era daí
 * que vinha a travadinha no celular do host.
 */
export const DrawingHostActions = memo(DrawingHostActionsBase);
