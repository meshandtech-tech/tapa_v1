import { AnimatePresence, motion } from "motion/react";
import { ImageOff } from "lucide-react";
import { cn } from "../../ui/cn";
import { IMPROV_SLIDES_CONFIG, SLIDE_BEATS } from "./config";
import { slideSrc } from "./library";

/**
 * O palco da apresentação.
 *
 * Deliberadamente sério: moldura limpa, tipografia forte, cronômetro de
 * conferência. A piada é a imagem e o desespero de quem está falando — se a
 * interface também fizesse piada, não sobraria contraste. É para parecer que
 * alguém subiu no palco errado com o deck errado.
 */
export function SlideStage({
  slideId,
  index,
  presenterName,
  remainingMs,
  compact,
}: {
  slideId: string | null;
  index: number;
  presenterName: string;
  remainingMs: number;
  /** Versão reduzida, para quem está assistindo pelo próprio celular. */
  compact?: boolean;
}) {
  const total = IMPROV_SLIDES_CONFIG.slidesPerPresentation;
  const segundos = Math.max(0, Math.ceil(remainingMs / 1000));
  const urgente = segundos <= 3;
  const ultimo = index === total - 1;
  const src = slideId ? slideSrc(slideId) : null;

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2",
        // Cresce com a tela em vez de com o papel de quem olha. A versão
        // anterior travava a plateia em 384px, o que fazia sentido no celular
        // e deixava o slide minúsculo num laptop ligado na TV — justamente a
        // tela em que ele deveria ser enorme.
        compact ? "max-w-md sm:max-w-xl lg:max-w-3xl" : "max-w-md sm:max-w-2xl lg:max-w-5xl",
      )}
    >
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-xl font-extrabold uppercase leading-none text-on-accent">
            {presenterName}
          </p>
          <p className="mt-1 font-action text-[0.7rem] uppercase tracking-[0.2em] text-on-accent opacity-70">
            Slide {index + 1} / {total} · {SLIDE_BEATS[index] ?? ""}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 border-4 border-ink px-3 py-1 font-display text-3xl font-extrabold tabular-nums",
            urgente ? "animate-pulse bg-ink text-paper" : "bg-paper text-ink",
          )}
        >
          {String(Math.floor(segundos / 60)).padStart(2, "0")}:
          {String(segundos % 60).padStart(2, "0")}
        </span>
      </div>

      {/* Moldura de proporção fixa: as imagens têm formatos diferentes e o
          layout não pode dançar a cada troca de slide. */}
      <div className="relative aspect-[4/3] w-full overflow-hidden border-4 border-ink bg-white shadow-brutal">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${slideId}-${index}`}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: IMPROV_SLIDES_CONFIG.slideTransitionMs / 1000 }}
            className="absolute inset-0 grid place-items-center p-2"
          >
            {src ? (
              // `contain`: nada de cortar a parte que faz a imagem ser absurda.
              <img
                src={src}
                alt={`Slide ${index + 1}`}
                className="max-h-full max-w-full object-contain"
                draggable={false}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-ink">
                <ImageOff strokeWidth={2.5} className="size-10 opacity-40" />
                <p className="font-hand text-lg opacity-70">Slide indisponível</p>
                <p className="font-action text-xs uppercase opacity-50">improvisa aí</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Barra de progresso da apresentação inteira, no rodapé da moldura. */}
        <div className="absolute inset-x-0 bottom-0 flex h-2 gap-0.5 bg-ink/10">
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={cn("h-full flex-1", i <= index ? "bg-ink" : "bg-transparent")}
            />
          ))}
        </div>
      </div>

      {ultimo ? (
        <p className="text-center font-action text-xs uppercase tracking-[0.2em] text-on-accent">
          Último slide — fecha a história
        </p>
      ) : null}
    </div>
  );
}
