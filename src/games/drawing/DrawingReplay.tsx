import { useEffect, useRef, useState } from "react";
import { PencilOff } from "lucide-react";
import { cn } from "../../ui/cn";
import { BRUSH_COLORS } from "./config";
import { parseStrokes, replayStrokes } from "./strokes";
import type { DrawingPageDraw } from "../../party/types";

export function drawingFallbackMessage(page: DrawingPageDraw, imageFailed = false): string {
  if (imageFailed) return "A imagem não pôde ser carregada";
  if (page.status === "missed") return "Este jogador não enviou um desenho";
  if (page.status === "failed") return "O desenho não pôde ser recuperado";
  if (page.status === "pending") return "O desenho ainda está chegando";
  return "Folha em branco";
}

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
  // Guardamos QUAL URL falhou, em vez de um booleano que vazaria para a
  // próxima página quando a revelação avançasse sem remontar o componente.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imageFailed = !!page.url && failedUrl === page.url;
  const strokes = page.url && !imageFailed ? null : parseStrokes(page.strokes);

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
  }, [imageFailed, page.strokes, page.url, onReady]);

  if (page.url && !imageFailed) {
    return (
      <img
        src={page.url}
        alt="Desenho de outro jogador"
        onLoad={onReady}
        onError={() => setFailedUrl(page.url)}
        className={cn("size-full bg-white object-contain", className)}
      />
    );
  }

  if (strokes) {
    return <canvas ref={canvasRef} className={cn("block size-full bg-white", className)} />;
  }

  const mensagem = drawingFallbackMessage(page, imageFailed);

  return (
    <div className={cn("grid size-full place-items-center gap-2 bg-white p-6 text-center", className)}>
      <PencilOff strokeWidth={2.5} className="size-10 opacity-40" />
      <p className="font-hand text-lg opacity-70">{mensagem}</p>
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
