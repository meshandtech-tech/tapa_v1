import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "./cn";

export interface WheelProps {
  /** Rótulos dos segmentos, na ordem. Mínimo 2. */
  items: readonly string[];
  /** Quem vai ganhar. Decidido FORA daqui — a roleta só encena. */
  winnerIndex: number;
  onFinish?: (index: number) => void;
  /** Duração do giro. Menos que ~3s tira o suspense. */
  durationMs?: number;
  className?: string;
}

const TURNS = 6;
const R = 50;

/**
 * Perfil de velocidade da roleta, amostrado e integrado uma vez.
 *
 * A sensação de game show vem de quatro trechos: arranque curto, patamar
 * rápido, desaceleração longa e um arrasto final quase parando — é no arrasto
 * que dá para acompanhar item por item ("tac... tac... tac").
 *
 * Integrar numericamente em vez de escrever uma cúbica à mão deixa o perfil
 * legível e fácil de ajustar: mexe-se na velocidade, não na posição.
 */
function velocityAt(t: number): number {
  if (t < 0.08) return t / 0.08; // arranque
  if (t < 0.45) return 1; // patamar
  if (t < 0.88) {
    const k = (t - 0.45) / 0.43; // desaceleração
    return 1 - 0.94 * k * k;
  }
  return 0.06 * (1 - (t - 0.88) / 0.12); // arrasto final
}

function buildCurve(samples = 240): number[] {
  const acumulado: number[] = [0];
  for (let i = 1; i <= samples; i += 1) {
    acumulado.push(acumulado[i - 1] + velocityAt(i / samples));
  }
  const total = acumulado[samples];
  return acumulado.map((v) => v / total);
}

/** Progresso (0..1) da rotação no instante t (0..1). */
function progressAt(curve: number[], t: number): number {
  const n = curve.length - 1;
  const x = Math.min(n, Math.max(0, t * n));
  const i = Math.floor(x);
  const frac = x - i;
  return curve[i] + (curve[Math.min(n, i + 1)] - curve[i]) * frac;
}

/** Fatia sob o ponteiro (topo) para uma dada rotação em graus. */
function segmentUnderPointer(rotation: number, count: number): number {
  const seg = 360 / count;
  const normal = ((-rotation % 360) + 360) % 360;
  return Math.floor(normal / seg) % count;
}

/** Rotação final que deixa o vencedor centrado no ponteiro. */
function finalRotation(winner: number, count: number): number {
  const seg = 360 / count;
  const alvo = (360 - (winner * seg + seg / 2)) % 360;
  return TURNS * 360 + alvo;
}

function wedgePath(index: number, count: number): string {
  const seg = (2 * Math.PI) / count;
  // -90° põe o segmento 0 começando no topo, alinhado com o ponteiro.
  const a0 = index * seg - Math.PI / 2;
  const a1 = a0 + seg;
  const x0 = 50 + R * Math.cos(a0);
  const y0 = 50 + R * Math.sin(a0);
  const x1 = 50 + R * Math.cos(a1);
  const y1 = 50 + R * Math.sin(a1);
  return `M50,50 L${x0.toFixed(3)},${y0.toFixed(3)} A${R},${R} 0 0 1 ${x1.toFixed(3)},${y1.toFixed(3)} Z`;
}

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Roleta genérica, usada por todos os jogos que sorteiam alguma coisa.
 *
 * Não decide nada: recebe o vencedor pronto (que vem do estado da party, para
 * a TV e os celulares nunca discordarem) e só encena o sorteio.
 */
export function Wheel({
  items,
  winnerIndex,
  onFinish,
  durationMs = 5200,
  className,
}: WheelProps) {
  const count = Math.max(2, items.length);
  const seg = 360 / count;
  const curve = useMemo(() => buildCurve(), []);
  const [rotation, setRotation] = useState(0);
  const [active, setActive] = useState(() => segmentUnderPointer(0, count));
  const [done, setDone] = useState(false);
  const finished = useRef(false);
  const base = useRef(0);

  useEffect(() => {
    finished.current = false;
    setDone(false);
    const alvo = base.current + finalRotation(winnerIndex, count);

    if (prefersReducedMotion()) {
      base.current = alvo;
      setRotation(alvo);
      setActive(winnerIndex);
      setDone(true);
      onFinish?.(winnerIndex);
      return;
    }

    const inicio = base.current;
    const delta = alvo - inicio;
    const t0 = performance.now();
    let raf = 0;

    const passo = (agora: number) => {
      const t = Math.min(1, (agora - t0) / durationMs);
      const r = inicio + delta * progressAt(curve, t);
      setRotation(r);
      setActive(segmentUnderPointer(r, count));

      if (t < 1) {
        raf = requestAnimationFrame(passo);
        return;
      }
      base.current = alvo;
      setActive(winnerIndex);
      setDone(true);
      if (!finished.current) {
        finished.current = true;
        onFinish?.(winnerIndex);
      }
    };

    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
    // `onFinish` de propósito fora das deps: uma função nova por render
    // reiniciaria o giro no meio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winnerIndex, count, durationMs, curve]);

  return (
    <div className={cn("relative mx-auto aspect-square w-full max-w-[min(72vh,44rem)]", className)}>
      {/* Ponteiro: miolo branco dentro de um contorno preto, porque a fatia
          vencedora fica preta — um ponteiro sólido sumiria justamente na hora
          em que ele mais importa. */}
      <div aria-hidden="true" className="absolute left-1/2 top-[-14px] z-20 -translate-x-1/2">
        <div className="size-0 border-x-[26px] border-t-[46px] border-x-transparent border-t-ink" />
        <div className="absolute left-1/2 top-[7px] size-0 -translate-x-1/2 border-x-[16px] border-t-[28px] border-x-transparent border-t-paper" />
      </div>

      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label={done ? `Roleta parou em ${items[winnerIndex]}` : "Roleta girando"}
        className="size-full drop-shadow-[6px_6px_0_var(--color-ink)]"
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        {items.map((label, index) => {
          const destaque = index === active;
          return (
            <g key={index}>
              <path
                d={wedgePath(index, count)}
                fill={
                  destaque
                    ? "var(--color-ink)"
                    : index % 2 === 0
                      ? "var(--tapa-accent)"
                      : "var(--color-paper)"
                }
                stroke="var(--color-ink)"
                strokeWidth={2}
                style={{ transition: "fill 80ms linear" }}
              />
              {/* Número grande em vez do texto da prenda: com 12 fatias o
                  texto vira borrão, e o rótulo completo aparece no card
                  depois que a roleta para. */}
              <text
                x={50}
                y={14}
                textAnchor="middle"
                fontSize={destaque ? 8 : 6.5}
                fontWeight={800}
                fill={destaque ? "var(--color-paper)" : "var(--color-ink)"}
                transform={`rotate(${index * seg + seg / 2} 50 50)`}
                className="font-display"
                style={{ transition: "fill 80ms linear, font-size 80ms linear" }}
              >
                {index + 1}
              </text>
              <title>{label}</title>
            </g>
          );
        })}
        <circle cx={50} cy={50} r={49} fill="none" stroke="var(--color-ink)" strokeWidth={4} />
      </svg>

      {/* Cubo central. */}
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
