import { Wifi, WifiOff, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../ui/cn";

/**
 * O estado da conexão, discreto e sempre no mesmo canto.
 *
 * A festa travada não tinha como distinguir "o app congelou" de "meu 5G caiu
 * por três segundos". As duas coisas são a mesma tela parada, e a mesa
 * culpa o app — que é o que aconteceu. Um selo pequeno resolve isso sem
 * ocupar espaço nem competir com o jogo.
 *
 * Fica INVISÍVEL enquanto está tudo bem: aparecer só quando há o que dizer é o
 * que o mantém não-intrusivo. Um indicador verde permanente vira ruído e as
 * pessoas param de ver.
 */
export function ConnectionBadge({
  connection,
  className,
}: {
  connection: "connecting" | "connected" | "offline" | "closed";
  className?: string;
}) {
  if (connection === "connected" || connection === "closed") return null;

  const reconectando = connection === "connecting";

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed inset-x-0 top-[max(0.5rem,env(safe-area-inset-top))] z-50",
        "flex justify-center px-4",
        className,
      )}
    >
      <span
        className={cn(
          "flex items-center gap-2 border-4 border-ink px-3 py-1",
          "font-action text-[0.65rem] uppercase tracking-wide shadow-brutal",
          reconectando ? "bg-paper text-ink" : "bg-ink text-paper",
        )}
      >
        {reconectando ? (
          <>
            <Loader2 strokeWidth={3} className="size-4 animate-spin" />
            Reconectando
          </>
        ) : (
          <>
            <WifiOff strokeWidth={3} className="size-4" />
            Sem conexão — tentando voltar
          </>
        )}
      </span>
    </motion.div>
  );
}

/** Só para o painel de diagnóstico, onde o estado "tudo bem" também importa. */
export function ConnectionDot({ connection }: { connection: string }) {
  const cor =
    connection === "connected" ? "bg-[#3ddc97]"
    : connection === "connecting" ? "bg-[#ffb703]"
    : "bg-[#ef476f]";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", cor)} />
      <Wifi strokeWidth={3} className="size-3 opacity-50" />
    </span>
  );
}
