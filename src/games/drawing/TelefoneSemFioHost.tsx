import { Brush, PencilLine, Users } from "lucide-react";
import { Avatar } from "../../ui/Avatar";
import { Card, Knockout } from "../../ui/Card";
import { cn } from "../../ui/cn";
import { RevealScreen } from "./RevealScreen";
import { submissionProgress } from "./state";
import type { PartyState } from "../../party/types";

/**
 * O Telefone Sem Fio de Desenho na tela grande.
 *
 * O jogo é de celular por natureza — cada pessoa tem um caderno secreto, e uma
 * tela compartilhada é o pior lugar possível para isso. Então enquanto se
 * desenha e se adivinha, a TV mostra só quem já entregou; ela nunca revela
 * conteúdo.
 *
 * Na REVELAÇÃO ela vira útil de verdade: aí todo mundo quer olhar para a mesma
 * página ao mesmo tempo.
 */
export function TelefoneSemFioHost({ state }: { state: PartyState }) {
  const drawing = state.drawing;
  if (!drawing) return null;

  if (state.phase === "REVEAL_PAGE") {
    return (
      <div className="grid h-full place-items-center">
        <div className="w-full max-w-xl">
          <RevealScreen state={state} drawing={drawing} />
        </div>
      </div>
    );
  }

  if (state.phase === "DRAW_STEP" || state.phase === "GUESS_STEP") {
    const { done, total } = submissionProgress(drawing);
    const desenhando = state.phase === "DRAW_STEP";
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
        {desenhando ? (
          <Brush strokeWidth={2.5} className="size-20 text-on-accent" />
        ) : (
          <PencilLine strokeWidth={2.5} className="size-20 text-on-accent" />
        )}
        <p className="font-display text-5xl font-extrabold uppercase text-on-accent">
          {desenhando ? "Todo mundo desenhando" : "Todo mundo adivinhando"}
        </p>
        <Knockout tilt="tilt-2" className="px-10 py-4">
          <p className="font-display text-6xl font-extrabold tabular-nums">
            {done} / {total}
          </p>
        </Knockout>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {drawing.seatOrder.map((id) => {
            const player = state.players.find((p) => p.id === id);
            if (!player) return null;
            const pronto = drawing.submitted.includes(id);
            return (
              <Avatar
                key={id}
                seed={player.avatarSeed}
                color={pronto ? player.color : undefined}
                size="sm"
                className={cn(!pronto && "opacity-35")}
              />
            );
          })}
        </div>
        {/* Nada do conteúdo aparece aqui: a graça inteira depende do segredo. */}
        <p className="font-hand text-2xl text-on-accent opacity-80">
          o jogo está nos celulares — esta tela não conta nada
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
      <Users strokeWidth={2.5} className="size-16 text-on-accent" />
      <Card className="max-w-xl p-6">
        <p className="font-display text-3xl font-extrabold uppercase">Telefone Sem Fio</p>
        <p className="mt-2 font-hand text-2xl">
          Acompanhe pelo celular. Esta tela entra na hora da revelação.
        </p>
      </Card>
    </div>
  );
}
