import { useEffect, useRef, useState } from "react";
import { punishments } from "../data/punishments";
import { cn } from "../ui/cn";

const SEGMENTS = punishments.length;
const SEGMENT_ANGLE = 360 / SEGMENTS;
const SPIN_MS = 4200;
/** Voltas inteiras antes de parar — é o que dá peso ao giro. */
const FULL_TURNS = 5;

/**
 * Ângulo que traz o segmento escolhido até o ponteiro (topo), a partir de um
 * número acumulado de voltas. Acumular é o que faz a roleta girar SEMPRE para
 * a frente quando o host pede outra prenda — resetar faria a roda voltar.
 */
function angleFor(index: number, turns: number): number {
  return turns * 360 - index * SEGMENT_ANGLE - SEGMENT_ANGLE / 2;
}

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Roleta de prendas. O resultado NÃO é sorteado aqui — chega pronto pelo
 * estado da party, senão a TV e os celulares poderiam mostrar prendas
 * diferentes. Este componente só encena o giro.
 */
export function PunishmentWheel({
  punishmentIndex,
  onDone,
  className,
}: {
  punishmentIndex: number;
  onDone?: () => void;
  className?: string;
}) {
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const done = useRef(false);
  const turns = useRef(0);

  useEffect(() => {
    done.current = false;
    turns.current += FULL_TURNS;
    const target = angleFor(punishmentIndex, turns.current);

    if (prefersReducedMotion()) {
      setAngle(target);
      done.current = true;
      onDone?.();
      return;
    }

    // Um quadro parado antes de girar, senão a transição não engata.
    const start = window.setTimeout(() => {
      setSpinning(true);
      setAngle(target);
    }, 60);

    // Rede de segurança: se o transitionend não vier (aba em segundo plano,
    // por exemplo), a festa não pode ficar presa na roleta.
    const fallback = window.setTimeout(() => {
      if (done.current) return;
      done.current = true;
      onDone?.();
    }, SPIN_MS + 600);

    return () => {
      window.clearTimeout(start);
      window.clearTimeout(fallback);
    };
  }, [punishmentIndex, onDone]);

  // Fatias alternadas: accent do tema e papel branco.
  const wedges = Array.from({ length: SEGMENTS }, (_, index) => {
    const from = index * SEGMENT_ANGLE;
    const color = index % 2 === 0 ? "var(--tapa-accent)" : "var(--color-paper)";
    return `${color} ${from}deg ${from + SEGMENT_ANGLE}deg`;
  }).join(", ");

  return (
    <div className={cn("relative mx-auto aspect-square w-full max-w-md", className)}>
      {/* Ponteiro fixo no topo. */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-[-14px] z-20 size-0 -translate-x-1/2
                   border-x-[18px] border-t-[30px] border-x-transparent border-t-ink"
      />

      <div
        role="img"
        aria-label={`Roleta de prendas girando${spinning ? "" : ", parada"}`}
        onTransitionEnd={() => {
          if (done.current) return;
          done.current = true;
          setSpinning(false);
          onDone?.();
        }}
        className="size-full rounded-full border-8 border-ink shadow-brutal-xl"
        style={{
          background: `conic-gradient(${wedges})`,
          transform: `rotate(${angle}deg)`,
          transition: spinning
            ? `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.9, 0.2, 1)`
            : undefined,
        }}
      />

      {/* Cubo central, para a roda não parecer um disco vazio. */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 z-10 grid size-20 -translate-x-1/2 -translate-y-1/2
                   place-items-center rounded-full border-8 border-ink bg-paper
                   font-display text-3xl font-extrabold"
      >
        !
      </div>
    </div>
  );
}
