/**
 * O traço, em coordenadas de 0 a 1.
 *
 * Guardar pixel seria mais simples e estaria errado: o desenho feito num
 * iPhone estreito é revisto num iPad deitado, e o celular pode girar no meio
 * dos 90 segundos. Em fração do lado, o mesmo traço serve para qualquer tela —
 * girar o aparelho deixa de apagar ou esticar o que já foi desenhado.
 *
 * A largura também é fração (do lado MENOR do canvas), senão o pincel ficaria
 * grosso no celular e fino no tablet.
 */
export type StrokeTool = "brush" | "eraser";

export interface StrokePoint {
  x: number;
  y: number;
}

export interface DrawingStroke {
  tool: StrokeTool;
  /** Fração do lado menor do canvas. */
  width: number;
  /** Índice em `BRUSH_COLORS`. Ausente = preto, para traço antigo. */
  color?: number;
  points: StrokePoint[];
}

export type Drawing = DrawingStroke[];

/** Resolução da quantização. 2048 passos é mais fino que qualquer tela. */
const GRADE = 2048;
/**
 * v2 acrescentou a cor ao cabeçalho do traço.
 *
 * A v1 continua sendo lida: rascunho salvo no celular de alguém antes da
 * atualização não pode virar tela em branco no meio da rodada.
 */
const VERSAO = 2;

const clamp01 = (valor: number) => (valor < 0 ? 0 : valor > 1 ? 1 : valor);
const paraGrade = (valor: number) => Math.round(clamp01(valor) * GRADE);
const daGrade = (valor: number) => valor / GRADE;

/**
 * Vira texto curto para caber no canal e no localStorage.
 *
 * Ponto vira par de inteiros na grade, não float com 15 casas: um traço de 300
 * pontos em JSON cru passa de 10 kB, e o mesmo traço quantizado fica em ~2 kB
 * sem nenhuma diferença visível.
 */
export function serializeStrokes(strokes: Drawing): string {
  const compacto = strokes.map((stroke) => {
    // A cor viaja como ÍNDICE da paleta, não como "#rrggbb": um número contra
    // sete caracteres, num payload que já é o mais pesado do jogo.
    const cabeca = [stroke.tool === "eraser" ? 1 : 0, paraGrade(stroke.width), stroke.color ?? 0];
    const pontos = stroke.points.flatMap((ponto) => [paraGrade(ponto.x), paraGrade(ponto.y)]);
    return [...cabeca, ...pontos];
  });
  return JSON.stringify({ v: VERSAO, g: GRADE, s: compacto });
}

/** `null` para qualquer coisa que não seja um desenho válido — nunca lança. */
export function parseStrokes(raw: string | null | undefined): Drawing | null {
  if (!raw) return null;
  try {
    const dado = JSON.parse(raw) as { v?: number; g?: number; s?: unknown };
    if ((dado.v !== VERSAO && dado.v !== 1) || !Array.isArray(dado.s)) return null;
    const grade = typeof dado.g === "number" && dado.g > 0 ? dado.g : GRADE;
    // v1: [ferramenta, largura, ...pontos]. v2: [ferramenta, largura, cor, ...].
    const cabecalho = dado.v === 1 ? 2 : 3;

    const strokes: Drawing = [];
    for (const item of dado.s) {
      if (!Array.isArray(item) || item.length < cabecalho) return null;
      if (!item.every((valor) => typeof valor === "number" && Number.isFinite(valor))) return null;
      // Cabeça + pares de coordenada: comprimento ímpar é dado corrompido.
      if ((item.length - cabecalho) % 2 !== 0) return null;

      const points: StrokePoint[] = [];
      for (let i = cabecalho; i < item.length; i += 2) {
        points.push({ x: clamp01(item[i] / grade), y: clamp01(item[i + 1] / grade) });
      }
      strokes.push({
        tool: item[0] === 1 ? "eraser" : "brush",
        width: clamp01(item[1] / grade),
        color: cabecalho === 3 ? Math.max(0, Math.trunc(item[2])) : 0,
        points,
      });
    }
    return strokes;
  } catch {
    return null;
  }
}

/** Desenho sem nenhum traço com ponto. Vale para "entregou em branco". */
export function isBlank(strokes: Drawing): boolean {
  return strokes.every((stroke) => stroke.points.length === 0);
}

/**
 * Tira pontos que não mudam nada.
 *
 * O ponteiro dispara dezenas de eventos por segundo e muitos caem quase em
 * cima do anterior. Descartar os que estão a menos de `tolerancia` corta o
 * tamanho pela metade sem tirar nada que o olho veja.
 */
export function simplifyStroke(points: readonly StrokePoint[], tolerancia = 0.003): StrokePoint[] {
  if (points.length <= 2) return [...points];
  const saida: StrokePoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const anterior = saida[saida.length - 1];
    const dx = points[i].x - anterior.x;
    const dy = points[i].y - anterior.y;
    if (Math.hypot(dx, dy) >= tolerancia) saida.push(points[i]);
  }
  // O último ponto sempre entra: é onde o dedo levantou.
  saida.push(points[points.length - 1]);
  return saida;
}

/** Interface mínima de canvas que o replay usa — o teste passa um dublê. */
export type ReplayContext = Pick<
  CanvasRenderingContext2D,
  | "beginPath" | "moveTo" | "lineTo" | "quadraticCurveTo" | "stroke" | "arc" | "fill"
> & {
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
  globalCompositeOperation: GlobalCompositeOperation;
};

/**
 * Redesenha o traço inteiro num contexto 2D.
 *
 * É a MESMA função usada pelo editor (a cada desfazer) e pela exportação, então
 * o que a pessoa vê enquanto desenha é exatamente o que vira imagem.
 *
 * A curva quadrática entre pontos médios existe porque ligar os pontos com reta
 * deixa o traço visivelmente poligonal num dedo rápido.
 */
export function replayStrokes(
  ctx: ReplayContext,
  strokes: Drawing,
  width: number,
  height: number,
  /** Paleta a usar. Injetada para esta função não depender do config. */
  palette: readonly string[] = ["#111111"],
): void {
  const menor = Math.min(width, height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const stroke of strokes) {
    const pontos = stroke.points;
    if (pontos.length === 0) continue;

    // A borracha fura o que já existe em vez de pintar de branco — assim o
    // fundo continua transparente e a exportação escolhe a cor do papel.
    ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
    const cor = palette[stroke.color ?? 0] ?? palette[0] ?? "#111111";
    ctx.strokeStyle = cor;
    ctx.fillStyle = cor;
    ctx.lineWidth = Math.max(1, stroke.width * menor);

    if (pontos.length === 1) {
      // Toque sem arrastar: uma bolinha, senão o ponto simplesmente some.
      ctx.beginPath();
      ctx.arc(pontos[0].x * width, pontos[0].y * height, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(pontos[0].x * width, pontos[0].y * height);
    for (let i = 1; i < pontos.length - 1; i += 1) {
      const meioX = ((pontos[i].x + pontos[i + 1].x) / 2) * width;
      const meioY = ((pontos[i].y + pontos[i + 1].y) / 2) * height;
      ctx.quadraticCurveTo(pontos[i].x * width, pontos[i].y * height, meioX, meioY);
    }
    const ultimo = pontos[pontos.length - 1];
    ctx.lineTo(ultimo.x * width, ultimo.y * height);
    ctx.stroke();
  }

  ctx.globalCompositeOperation = "source-over";
}
