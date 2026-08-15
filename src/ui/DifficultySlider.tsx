import { useRef, useState } from "react";
import { motion } from "motion/react";
import { DIFFICULTIES, DIFFICULTY_LABELS, type Difficulty } from "../party/types";
import { cn } from "./cn";

/** Vibração curta ao trocar de zona. Ignorado onde não existir. */
function buzz(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(12);
  }
}

/**
 * Dificuldade por arrasto, com encaixe nas três zonas.
 *
 * Nunca fica um valor entre duas zonas: o token pode ser solto em qualquer
 * ponto, mas o estado só assume `easy | medium | hard`. O arrasto é livre; o
 * resultado é discreto.
 */
export function DifficultySlider({
  value,
  onChange,
  className,
}: {
  value: Difficulty;
  onChange: (value: Difficulty) => void;
  className?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const index = Math.max(0, DIFFICULTIES.indexOf(value));
  const zones = DIFFICULTIES.length;

  /** Traduz a posição do token na trilha para a zona mais próxima. */
  const zoneFromPoint = (clientX: number): Difficulty => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return value;
    const ratio = (clientX - rect.left) / rect.width;
    const zone = Math.min(zones - 1, Math.max(0, Math.floor(ratio * zones)));
    return DIFFICULTIES[zone];
  };

  return (
    <div className={cn("w-full select-none", className)}>
      <div
        ref={track}
        className="relative h-20 w-full border-4 border-ink bg-paper"
        // A intensidade do fundo acompanha a dificuldade escolhida.
        style={{ boxShadow: `inset 0 0 0 ${index * 8}px var(--tapa-accent-soft)` }}
      >
        {/* Zonas como alvos de clique — arrastar é opcional, tocar também vale. */}
        <div className="absolute inset-0 grid grid-cols-3">
          {DIFFICULTIES.map((option, i) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                if (option !== value) buzz();
                onChange(option);
              }}
              aria-pressed={option === value}
              className={cn(
                "flex cursor-pointer items-center justify-center font-action text-sm uppercase",
                "focus-visible:outline-4 focus-visible:-outline-offset-4 focus-visible:outline-ink",
                i > 0 ? "border-l-4 border-dashed border-ink" : "",
                option === value ? "text-ink" : "text-ink/40",
              )}
            >
              {DIFFICULTY_LABELS[option]}
            </button>
          ))}
        </div>

        {/* O token. `dragSnapToOrigin` devolve ao lugar; quem manda é o estado. */}
        <motion.button
          type="button"
          drag="x"
          dragConstraints={track}
          dragElastic={0.04}
          dragMomentum={false}
          dragSnapToOrigin
          onDragStart={() => setDragging(true)}
          onDragEnd={(event) => {
            setDragging(false);
            const x =
              "clientX" in event
                ? (event as PointerEvent).clientX
                : ((event as TouchEvent).changedTouches?.[0]?.clientX ?? 0);
            const next = zoneFromPoint(x);
            if (next !== value) {
              buzz();
              onChange(next);
            }
          }}
          animate={{ left: `${(index + 0.5) * (100 / zones)}%` }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          aria-label={`Dificuldade: ${DIFFICULTY_LABELS[value]}`}
          className={cn(
            "absolute top-1/2 z-10 grid size-16 -translate-x-1/2 -translate-y-1/2 cursor-grab",
            "place-items-center border-4 border-ink bg-accent text-2xl shadow-brutal",
            "active:cursor-grabbing touch-none",
            dragging ? "scale-110" : "",
          )}
        >
          😈
        </motion.button>
      </div>
    </div>
  );
}
