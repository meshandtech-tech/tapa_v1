import { useEffect, useRef, useState } from "react";
import { cn } from "./cn";

/**
 * Sorteio estilo caça-níquel.
 *
 * Os nomes passam rápido, vão desacelerando e param no vencedor. Não decide
 * nada: recebe o vencedor pronto (que vem do estado da party, para TV e
 * celulares não discordarem) e só encena.
 *
 * Uma roleta aqui seria redundante — o jogo já tem uma para os temas, e com
 * poucos jogadores ela ficaria com fatias enormes e nenhum suspense.
 */
export function SlotMachine({
  items,
  winnerIndex,
  durationMs = 3200,
  onFinish,
  className,
}: {
  items: readonly string[];
  winnerIndex: number;
  durationMs?: number;
  onFinish?: () => void;
  className?: string;
}) {
  const [current, setCurrent] = useState(0);
  const [done, setDone] = useState(false);
  const avisou = useRef(false);

  useEffect(() => {
    if (items.length === 0) return;
    avisou.current = false;
    setDone(false);

    const reduzido =
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduzido) {
      setCurrent(winnerIndex);
      setDone(true);
      onFinish?.();
      return;
    }

    const inicio = performance.now();
    let timer = 0;

    const passo = () => {
      const t = Math.min(1, (performance.now() - inicio) / durationMs);
      if (t >= 1) {
        setCurrent(winnerIndex);
        setDone(true);
        if (!avisou.current) {
          avisou.current = true;
          onFinish?.();
        }
        return;
      }
      setCurrent((anterior) => (anterior + 1) % items.length);
      // O intervalo cresce de ~55ms para ~380ms: é a desaceleração.
      const intervalo = 55 + 325 * t * t;
      timer = window.setTimeout(passo, intervalo);
    };

    timer = window.setTimeout(passo, 55);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, winnerIndex, durationMs]);

  return (
    <div
      className={cn(
        "relative flex w-full items-center justify-center overflow-hidden",
        "border-8 border-ink bg-paper px-[3vw] py-[4vh] shadow-brutal-xl",
        done ? "motion-safe:scale-[1.03]" : "",
        "transition-transform duration-300",
        className,
      )}
    >
      <span
        className={cn(
          "block truncate text-center font-display font-extrabold uppercase leading-none",
          "text-[clamp(2.5rem,9vw,9rem)]",
          done ? "text-accent" : "text-ink",
        )}
      >
        {items[current] ?? ""}
      </span>
    </div>
  );
}
