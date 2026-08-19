import { Check, ChevronRight, Pause, Play, SkipForward, Square } from "lucide-react";
import type { HostCommand } from "../../party/channel";
import type { PartyState } from "../../party/types";
import { Button } from "../../ui/Button";
import { eligibleVoters, votesIn } from "./slides";

/**
 * Os botões do host no Pitch no Escuro.
 *
 * Durante a apresentação quase não há botão — e é regra do jogo, não descuido:
 * os slides passam sozinhos justamente para a pessoa não conseguir segurar
 * quando travar. O que existe ali é saída de emergência (imagem infeliz,
 * alguém passando mal, problema técnico), discreta de propósito.
 *
 * O host volta a mandar onde o grupo está falando: fechar a votação e chamar o
 * próximo.
 */
export function SlidesHostActions({
  state,
  send,
}: {
  state: PartyState;
  send: (command: HostCommand) => void;
}) {
  if (!state.slides) return null;
  const pausado = state.pausedAt !== null;

  const conteudo = (() => {
    switch (state.phase) {
      case "GAME_INTRO":
        return (
          <Button size="md" variant="solid" className="w-full" onClick={() => send({ type: "ADVANCE" })}>
            <Check strokeWidth={3} className="size-6" />
            Todo mundo entendeu, bora
          </Button>
        );

      case "PRESENTATION":
        return (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="paper"
              className="flex-1"
              onClick={() => send({ type: pausado ? "RESUME" : "PAUSE" })}
            >
              {pausado ? <Play strokeWidth={3} className="size-5" /> : <Pause strokeWidth={3} className="size-5" />}
              {pausado ? "Voltar" : "Pausar"}
            </Button>
            <Button size="sm" variant="paper" className="flex-1" onClick={() => send({ type: "SKIP_SLIDE" })}>
              <SkipForward strokeWidth={3} className="size-5" />
              Pular slide
            </Button>
            <Button size="sm" variant="knockout" className="flex-1" onClick={() => send({ type: "ADVANCE" })}>
              <Square strokeWidth={3} className="size-5" />
              Encerrar
            </Button>
          </div>
        );

      case "VOTING": {
        const faltam = eligibleVoters(state).length - votesIn(state);
        return (
          <Button size="md" variant="solid" className="w-full" onClick={() => send({ type: "ADVANCE" })}>
            <Check strokeWidth={3} className="size-6" />
            {faltam > 0 ? `Fechar votação (faltam ${faltam})` : "Ver a nota"}
          </Button>
        );
      }

      case "SCORE_REVEAL":
        return (
          <Button size="md" variant="solid" className="w-full" onClick={() => send({ type: "ADVANCE" })}>
            <ChevronRight strokeWidth={3} className="size-6" />
            Próximo apresentador
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
