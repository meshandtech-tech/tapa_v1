import { motion } from "motion/react";
import { Check } from "lucide-react";
import { Avatar } from "../../ui/Avatar";
import { Card } from "../../ui/Card";
import { cn } from "../../ui/cn";
import type { DrawingState, Player } from "../../party/types";

/**
 * Entreguei, e agora espero.
 *
 * O que NÃO aparece aqui é o ponto: nada do que os outros desenharam ou
 * escreveram. Mostrar adiantado mataria a surpresa da revelação, que é o
 * produto inteiro. Sobra o avatar de cada um acendendo conforme entrega —
 * informação suficiente para a mesa saber de quem está esperando, e para
 * começar a cobrar em voz alta, que é metade da graça.
 */
export function WaitingCard({
  drawing,
  players,
  titulo,
}: {
  drawing: DrawingState;
  players: readonly Player[];
  titulo: string;
}) {
  const entregues = drawing.submitted.length;
  const total = drawing.seatOrder.length;
  const naOrdem = drawing.seatOrder
    .map((id) => players.find((player) => player.id === id))
    .filter((player): player is Player => !!player);

  return (
    <Card tilt="tilt-2" className="w-full max-w-md p-6 text-center">
      <motion.div
        initial={{ scale: 0.6, rotate: -12 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 16 }}
        className="mx-auto grid size-16 place-items-center border-4 border-ink bg-accent text-on-accent"
      >
        <Check strokeWidth={3.5} className="size-9" />
      </motion.div>

      <h2 className="mt-4 font-display text-2xl font-extrabold uppercase leading-tight">{titulo}</h2>
      <p className="mt-1 font-hand text-lg">Esperando a galera…</p>

      <p className="mt-4 font-display text-5xl font-extrabold tabular-nums">
        {entregues} / {total}
      </p>
      <p className="font-action text-xs uppercase tracking-wide opacity-70">prontos</p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {naOrdem.map((player) => {
          const pronto = drawing.submitted.includes(player.id);
          return (
            <div
              key={player.id}
              className={cn(
                "flex flex-col items-center gap-1 transition-opacity",
                pronto ? "opacity-100" : "opacity-35",
              )}
            >
              <Avatar
                seed={player.avatarSeed}
                color={pronto ? player.color : undefined}
                size="sm"
              />
              <span className="max-w-14 truncate font-action text-[0.65rem] uppercase">
                {player.nickname}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
