import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { BRUSH_WIDTHS } from "./config";
import {
  replayStrokes,
  simplifyStroke,
  type Drawing,
  type StrokePoint,
  type StrokeTool,
} from "./strokes";
import { cn } from "../../ui/cn";

export interface DrawingCanvasHandle {
  getStrokes: () => Drawing;
  undo: () => void;
  clear: () => void;
}

interface DrawingCanvasProps {
  tool: StrokeTool;
  /** Avisa a cada traço terminado — o pai usa para salvar rascunho e ligar o desfazer. */
  onStrokesChange?: (strokes: Drawing) => void;
  initialStrokes?: Drawing;
  disabled?: boolean;
  className?: string;
}

/**
 * A superfície de desenho.
 *
 * Duas decisões sustentam a fluidez, e as duas são sobre NÃO passar pelo React:
 *
 * 1. O traço em andamento vive num `ref` e é pintado dentro de um
 *    `requestAnimationFrame`. Mandar cada coordenada do ponteiro para o
 *    `useState` re-renderizaria a árvore dezenas de vezes por segundo e o
 *    traço sairia aos soluços — que é exatamente o que estraga o jogo.
 * 2. Os traços já terminados ficam num canvas fora da tela. A cada quadro só
 *    se copia essa imagem e se repinta o traço corrente, em vez de redesenhar
 *    o desenho inteiro. Assim o custo por quadro não cresce com o tamanho do
 *    desenho.
 *
 * O redesenho completo acontece só quando de fato muda o histórico: desfazer,
 * limpar, ou a tela mudar de tamanho (girar o aparelho).
 */
export const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(
  function DrawingCanvas({ tool, onStrokesChange, initialStrokes, disabled, className }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const strokesRef = useRef<Drawing>(initialStrokes ? [...initialStrokes] : []);
    const currentRef = useRef<StrokePoint[] | null>(null);
    /** Traços já terminados, rasterizados uma vez. */
    const committedRef = useRef<HTMLCanvasElement | null>(null);
    const frameRef = useRef<number | null>(null);
    const toolRef = useRef<StrokeTool>(tool);
    toolRef.current = tool;
    const sizeRef = useRef({ width: 0, height: 0 });

    /** Redesenha os traços terminados. Só em desfazer, limpar ou resize. */
    const rebuildCommitted = useCallback(() => {
      const { width, height } = sizeRef.current;
      const committed = committedRef.current;
      if (!committed || width === 0) return;
      committed.width = width;
      committed.height = height;
      const ctx = committed.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      replayStrokes(ctx, strokesRef.current, width, height);
    }, []);

    /** Copia o histórico e pinta o traço em andamento por cima. */
    const paint = useCallback(() => {
      frameRef.current = null;
      const canvas = canvasRef.current;
      const committed = committedRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !committed || !ctx) return;

      const { width, height } = sizeRef.current;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(committed, 0, 0);

      const pontos = currentRef.current;
      if (pontos && pontos.length > 0) {
        replayStrokes(ctx, [{ tool: toolRef.current, width: larguraDe(toolRef.current), points: pontos }], width, height);
      }
    }, []);

    const requestPaint = useCallback(() => {
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(paint);
    }, [paint]);

    // Tamanho real do bitmap: CSS px vezes densidade da tela, senão o traço
    // sai borrado em qualquer aparelho retina.
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      committedRef.current ??= document.createElement("canvas");

      const resize = () => {
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const width = Math.round(rect.width * dpr);
        const height = Math.round(rect.height * dpr);
        if (width === sizeRef.current.width && height === sizeRef.current.height) return;

        canvas.width = width;
        canvas.height = height;
        sizeRef.current = { width, height };
        // Coordenada normalizada: girar o aparelho recoloca o traço no lugar
        // certo em vez de apagar ou esticar o que já foi desenhado.
        rebuildCommitted();
        requestPaint();
      };

      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(canvas);
      return () => observer.disconnect();
    }, [rebuildCommitted, requestPaint]);

    /**
     * Cancelar o quadro pendente TEM de zerar o ref junto.
     *
     * Sem isso o `requestPaint` continua achando que já existe um quadro
     * agendado e nunca mais agenda outro — a superfície fica viva, aceitando
     * ponteiro e guardando traço, e simplesmente não pinta mais nada. O
     * StrictMode dispara isso em toda montagem (monta, limpa, monta), então o
     * desenho nascia quebrado em desenvolvimento; em produção bastaria uma
     * remontagem, como a que uma troca de orientação pode causar.
     */
    useEffect(() => () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    }, []);

    const pontoDoEvento = (event: React.PointerEvent<HTMLCanvasElement>): StrokePoint => {
      const rect = event.currentTarget.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
      };
    };

    const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled) return;
      // Captura: o dedo pode sair do quadrado no meio do traço e o traço
      // continua sendo desta superfície até levantar.
      event.currentTarget.setPointerCapture(event.pointerId);
      currentRef.current = [pontoDoEvento(event)];
      requestPaint();
    };

    const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled || !currentRef.current) return;
      // getCoalescedEvents devolve as posições que o navegador agrupou entre
      // dois quadros — é o que salva o traço rápido de virar linha reta.
      const eventos = event.nativeEvent.getCoalescedEvents?.() ?? [];
      if (eventos.length > 0) {
        const rect = event.currentTarget.getBoundingClientRect();
        for (const bruto of eventos) {
          currentRef.current.push({
            x: (bruto.clientX - rect.left) / rect.width,
            y: (bruto.clientY - rect.top) / rect.height,
          });
        }
      } else {
        currentRef.current.push(pontoDoEvento(event));
      }
      requestPaint();
    };

    const finishStroke = useCallback(() => {
      const pontos = currentRef.current;
      currentRef.current = null;
      if (!pontos || pontos.length === 0) return;

      strokesRef.current = [
        ...strokesRef.current,
        { tool: toolRef.current, width: larguraDe(toolRef.current), points: simplifyStroke(pontos) },
      ];
      // Fixa no histórico rasterizado: o próximo quadro já parte daqui.
      const committed = committedRef.current;
      const ctx = committed?.getContext("2d");
      const { width, height } = sizeRef.current;
      if (ctx) {
        replayStrokes(ctx, [strokesRef.current[strokesRef.current.length - 1]], width, height);
      }
      requestPaint();
      onStrokesChange?.(strokesRef.current);
    }, [onStrokesChange, requestPaint]);

    useImperativeHandle(ref, () => ({
      getStrokes: () => strokesRef.current,
      undo: () => {
        if (strokesRef.current.length === 0) return;
        strokesRef.current = strokesRef.current.slice(0, -1);
        rebuildCommitted();
        requestPaint();
        onStrokesChange?.(strokesRef.current);
      },
      clear: () => {
        strokesRef.current = [];
        rebuildCommitted();
        requestPaint();
        onStrokesChange?.(strokesRef.current);
      },
    }), [onStrokesChange, rebuildCommitted, requestPaint]);

    return (
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
        onPointerLeave={finishStroke}
        aria-label="Área de desenho"
        className={cn(
          "block size-full bg-white",
          // Só AQUI o gesto é sequestrado: a página segue rolando normalmente
          // fora do quadrado, e nada de acessibilidade é desligado globalmente.
          "touch-none select-none",
          disabled && "pointer-events-none opacity-70",
          className,
        )}
      />
    );
  },
);

function larguraDe(tool: StrokeTool): number {
  return tool === "eraser" ? BRUSH_WIDTHS.eraser : BRUSH_WIDTHS.brush;
}
