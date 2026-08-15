import { Check, Dices, SkipForward, Square } from "lucide-react";
import type { HostCommand } from "../party/channel";
import type { PartyState } from "../party/types";
import { Button } from "../ui/Button";
import { eligibleVoters, votesIn } from "./advogadoDoDiabo";

/**
 * Os botões que o host aperta no Advogado do Diabo, no celular dele.
 *
 * Cada um aparece só na fase em que faz sentido: um painel com tudo sempre
 * visível vira ruído, e o host erraria o botão no meio da festa.
 */
export function DevilHostActions({
  state,
  send,
}: {
  state: PartyState;
  send: (command: HostCommand) => void;
}) {
  const faltamVotos = eligibleVoters(state).length - votesIn(state);

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

    /** Recusar a tese: troca o tema e mantém quem foi sorteado. */
    case "TOPIC_REVEAL":
    case "PREPARATION":
      return (
        <Button
          size="sm"
          variant="paper"
          className="w-full max-w-md"
          onClick={() => send({ type: "REROLL_TOPIC" })}
        >
          <Dices strokeWidth={3} className="size-5" />
          Essa não — sortear outra tese
        </Button>
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
}
