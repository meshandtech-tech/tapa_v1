import { useEffect, useRef } from "react";
import { PencilOff } from "lucide-react";
import { cn } from "../../ui/cn";
import { BRUSH_COLORS } from "./config";
import { parseStrokes, replayStrokes } from "./strokes";
import type { DrawingPageDraw } from "../../party/types";

/**
 * Mostra um desenho entregue.
 *
 * Dois caminhos, e o segundo é o que salva a partida: normalmente a imagem
 * veio do Storage e é só um `<img>`; quando não houve Storage — dev local, ou
 * upload que falhou — os traços vieram pelo canal e são repintados aqui. A
 * pessoa do outro lado não percebe diferença, que é o objetivo.
 */
export function DrawingReplay({
  page,
  className,
  onReady,
}: {
  page: DrawingPageDraw;
  className?: string;
  onReady?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokes = page.url ? null : parseStrokes(page.strokes);

  useEffect(() => {
    if (!strokes) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const desenhar = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      replayStrokes(ctx, strokes, canvas.width, canvas.height, BRUSH_COLORS);
      onReady?.();
    };

    desenhar();
    const observer = new ResizeObserver(desenhar);
    observer.observe(canvas);
    return () => observer.disconnect();
    // `strokes` é recriado a cada render; o que muda de verdade é o texto.
  }, [page.strokes, page.url, onReady]);

  if (page.url) {
    return (
      <img
        src={page.url}
        alt="Desenho de outro jogador"
        onLoad={onReady}
        className={cn("size-full bg-white object-contain", className)}
      />
    );
  }

  if (strokes) {
    return <canvas ref={canvasRef} className={cn("block size-full bg-white", className)} />;
  }

  // Ninguém entregou: folha em branco mesmo. Faz parte do caos.
  return (
    <div className={cn("grid size-full place-items-center gap-2 bg-white p-6 text-center", className)}>
      <PencilOff strokeWidth={2.5} className="size-10 opacity-40" />
      <p className="font-hand text-lg opacity-70">Folha em branco</p>
    </div>
  );
}

/**
 * Carrega a imagem antes de ela ser necessária.
 *
 * A revelação não pode ter "avança → tela branca → imagem aparece": é o
 * momento em que a sala está olhando junto, e meio segundo de espera derruba
 * a piada. Como o endereço já está no estado de todo mundo, dá para buscar a
 * próxima enquanto a atual está na tela.
 */
export function preloadDrawing(url: string | null | undefined): void {
  if (!url || typeof Image === "undefined") return;
  const imagem = new Image();
  imagem.src = url;
}
