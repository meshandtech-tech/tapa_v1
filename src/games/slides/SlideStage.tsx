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

      {/*
        A MOLDURA ABRAÇA A IMAGEM — não o contrário.
        
        Antes era uma caixa fixa em 4:3 com a imagem contida dentro. Parecia
        certo e estava errado para este acervo: das 32 imagens, 12 são retrato
        (uma delas 0.56 de proporção) e 12 são quase quadradas. Uma imagem 0.56
        dentro de uma caixa 1.33 num celular só podia usar a altura, então saía
        com ~147px de largura — uma miniatura entre duas barras brancas. É o que
        parecia "cortando".

        Agora a borda envolve a própria imagem e o único limite é a altura
        disponível. Retrato fica alto, paisagem fica largo, e os dois usam a
        tela inteira que dá.
      */}
      <div className="flex w-full items-center justify-center">
        {/*
          A troca de slide usa CSS, não Motion.

          Com `initial={{opacity:0}}` do Motion, a animação não disparava no
          celular de quem assistia — só no de quem apresentava. A imagem
          carregava, ficava do tamanho certo, e o wrapper travava em
          `opacity: 0`: slide invisível numa tela que é o produto inteiro.

          A classe `.tapa-entra` não tem fill-mode: o estado natural é VISÍVEL e
          a animação só enfeita. Se não rodar, aparece assim mesmo.
        */}
        <div
          key={`${slideId}-${index}`}
          className="tapa-entra flex max-w-full items-center justify-center"
        >
          {src ? (
            // `contain`: nada de cortar a parte que faz a imagem ser absurda.
            <img
              src={src}
              alt={`Slide ${index + 1}`}
              draggable={false}
              className={cn(
                "block max-w-full border-4 border-ink bg-white object-contain shadow-brutal",
                compact ? "max-h-[46vh]" : "max-h-[58vh]",
              )}
            />
          ) : (
            <div
              className={cn(
                "grid aspect-square w-full place-items-center border-4 border-ink bg-white",
                compact ? "max-h-[46vh]" : "max-h-[58vh]",
              )}
            >
              <div className="flex flex-col items-center gap-2 text-ink">
                <ImageOff strokeWidth={2.5} className="size-10 opacity-40" />
                <p className="font-hand text-lg opacity-70">Slide indisponível</p>
                <p className="font-action text-xs uppercase opacity-50">improvisa aí</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* A barra de progresso saiu de cima da imagem: com a moldura abraçando
          a imagem, sobrepor cobriria justamente o rodapé do desenho. */}
      <div className="flex h-2 w-full gap-0.5 border-4 border-ink bg-paper p-0">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn("h-full flex-1", i <= index ? "bg-ink" : "bg-transparent")} />
        ))}
      </div>

      {ultimo ? (
        <p className="text-center font-action text-xs uppercase tracking-[0.2em] text-on-accent">
          Último slide — fecha a história
        </p>
      ) : null}
    </div>
  );
}
