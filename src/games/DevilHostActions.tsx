import { memo } from "react";
import { Check, Dices, SkipForward, Square } from "lucide-react";
import type { HostCommand } from "../party/channel";
import type { PartyState } from "../party/types";
import { Button } from "../ui/Button";
import { availableTopics, eligibleVoters, votesIn } from "./advogadoDoDiabo";

/**
 * Os botões que o host aperta no Advogado do Diabo, no celular dele.
 *
 * Cada um aparece só na fase em que faz sentido — um painel com tudo sempre
 * visível vira ruído e o host erra o botão no meio da festa.
 *
 * Fica numa BARRA FIXA no rodapé, por cima do conteúdo. Antes ficava no fim de
 * uma tela de 1800px e o host tinha que rolar para achar o botão da vez, às
 * vezes com menos de 5 segundos de janela.
 */
function DevilHostActionsBase({
  state,
  send,
}: {
  state: PartyState;
  send: (command: HostCommand) => void;
}) {
  const faltamVotos = eligibleVoters(state).length - votesIn(state);
  // O acervo é finito e a mesa merece saber o tamanho dele: um reroll custa
  // uma tese, e "restam 2" muda a decisão de quem está com o botão na mão.
  const restantes = state.devil ? availableTopics(state.devil).length : 0;

  const conteudo = (() => {
    switch (state.phase) {
      case "GAME_INTRO":
        return (
          <Button
            size="md"
            variant="solid"
            className="w-full max-w-md"
            onClick={() => send({ type: "ADVANCE" })}
        >
            <Check strokeWidth={3} className="size-6" />
            Entendi, vamos jogar
          </Button>
        );

      /**
       * REROLL: troca o TEMA e mantém quem foi sorteado.
       *
       * É diferente de encerrar a rodada, e o rótulo agora diz isso. A mesa
       * lê a tese, alguém acha pesada demais para o grupo, e o host resolve em
       * um toque — sem que quem foi sorteado perca a vez nem ganhe uma
       * apresentação contada.
       */
      case "TOPIC_REVEAL":
      case "PREPARATION":
        return (
          <div className="flex w-full max-w-md flex-col gap-1">
            <Button
              size="md"
              variant="paper"
              onClick={() => send({ type: "REROLL_TOPIC" })}
            >
              <Dices strokeWidth={3} className="size-5" />
              Trocar tese (reroll)
            </Button>
            <p className="text-center font-hand text-sm text-on-accent">
              {restantes > 0
                ? `Mesmo apresentador. ${restantes} ${
                    restantes === 1 ? "tese restante" : "teses restantes"
                  }.`
                : "Última tese do acervo."}
            </p>
          </div>
        );

      /** Acabou antes do tempo? Não faz sentido esperar o relógio. */
      case "PRESENTATION":
        return (
          <Button
            size="md"
            variant="solid"
            className="w-full max-w-md"
            onClick={() => send({ type: "ADVANCE" })}
        >
            <Square strokeWidth={3} className="size-5" />
            Encerrar apresentação
          </Button>
        );

      case "VOTING":
        return (
          <div className="flex w-full max-w-md flex-col gap-2">
            <Button size="md" variant="solid" onClick={() => send({ type: "ADVANCE" })}>
              <Check strokeWidth={3} className="size-6" />
              Fechar votação
            </Button>
            {faltamVotos > 0 ? (
              <p className="text-center font-hand text-base text-on-accent">
                Faltam {faltamVotos} — dá para fechar sem eles.
              </p>
            ) : null}
          </div>
        );

      case "SCORE_REVEAL":
        return (
          <Button
            size="md"
            variant="solid"
            className="w-full max-w-md"
            onClick={() => send({ type: "ADVANCE" })}
        >
            <SkipForward strokeWidth={3} className="size-6" />
            Próximo jogador
          </Button>
        );

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
export const DevilHostActions = memo(DevilHostActionsBase);
