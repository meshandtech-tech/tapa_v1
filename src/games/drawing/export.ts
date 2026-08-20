import { BRUSH_COLORS } from "./config";
import { replayStrokes, type Drawing } from "./strokes";

/**
 * O desenho é sempre QUADRADO.
 *
 * Coordenada normalizada estica para o formato do canvas, então gente
 * desenhando em telas de proporções diferentes veria o traço deformado na
 * revelação. Fixar o quadrado resolve, e é o único formato que não desperdiça
 * a tela nem no celular em pé nem no tablet deitado.
 */
export const DRAWING_ASPECT = 1;
/** Lado da imagem exportada. Cabe numa tela grande sem serrilhar. */
export const EXPORT_SIZE = 1024;

export interface ExportedDrawing {
  blob: Blob;
  /** `image/webp` quando o navegador codifica; `image/png` quando não. */
  type: string;
  extension: "webp" | "png";
}

/**
 * Vira arquivo de imagem.
 *
 * O fundo branco entra por ÚLTIMO, com `destination-over`. Pintar antes seria
 * o intuitivo e estaria errado: a borracha fura o que está embaixo, então ela
 * abriria buracos no papel em vez de apagar o traço.
 */
export async function renderToBlob(
  strokes: Drawing,
  size = EXPORT_SIZE,
): Promise<ExportedDrawing | null> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  replayStrokes(ctx, strokes, size, size, BRUSH_COLORS);

  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "source-over";

  const webp = await toBlob(canvas, "image/webp", 0.82);
  // Safari antigo aceita o pedido e devolve PNG calado; o tipo real é o que
  // veio de volta, nunca o que foi pedido.
  if (webp && webp.type === "image/webp") {
    return { blob: webp, type: webp.type, extension: "webp" };
  }
  const png = webp ?? (await toBlob(canvas, "image/png"));
  if (!png) return null;
  return { blob: png, type: png.type || "image/png", extension: "png" };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/**
 * Monta a corrente inteira numa imagem só, para o grupo mandar no zap.
 *
 * Existe porque print de tela corta e sai torto: aqui as páginas entram
 * empilhadas, na ordem, com o tema no topo e o palpite final no rodapé.
 */
export async function renderChainStrip(
  paginas: ReadonlyArray<{ titulo: string; texto?: string; imagem?: HTMLImageElement | null }>,
  largura = 720,
): Promise<Blob | null> {
  const alturaTexto = 96;
  const alturaImagem = largura;
  const alturas = paginas.map((pagina) => (pagina.imagem ? alturaImagem + 56 : alturaTexto));
  const total = alturas.reduce((soma, altura) => soma + altura, 0) + 32;

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = total;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#f2ebdb";
  ctx.fillRect(0, 0, largura, total);

  let y = 16;
  paginas.forEach((pagina, indice) => {
    ctx.fillStyle = "#111111";
    ctx.font = "bold 22px Helvetica, Arial, sans-serif";
    ctx.fillText(pagina.titulo.toUpperCase(), 20, y + 28);

    if (pagina.imagem) {
      ctx.drawImage(pagina.imagem, 20, y + 44, largura - 40, alturaImagem - 40);
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = 4;
      ctx.strokeRect(20, y + 44, largura - 40, alturaImagem - 40);
    } else if (pagina.texto) {
      ctx.font = "bold 30px Helvetica, Arial, sans-serif";
      ctx.fillText(recortar(ctx, pagina.texto, largura - 40), 20, y + 68);
    }
    y += alturas[indice];
  });

  return toBlob(canvas, "image/png");
}

/** Corta com reticências em vez de vazar para fora da imagem. */
function recortar(ctx: CanvasRenderingContext2D, texto: string, limite: number): string {
  if (ctx.measureText(texto).width <= limite) return texto;
  let curto = texto;
  while (curto.length > 1 && ctx.measureText(`${curto}…`).width > limite) {
    curto = curto.slice(0, -1);
  }
  return `${curto}…`;
}
