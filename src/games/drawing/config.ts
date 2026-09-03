/**
 * Ajustes do Telefone Sem Fio de Desenho, num lugar só.
 *
 * Nenhum componente repete estes números: as durações do registry derivam
 * daqui, e mexer no tempo de desenho da partida inteira é mexer numa linha.
 */
export const DRAWING_TELEPHONE_CONFIG = {
  /** Abaixo disso a corrente é curta demais para a piada acontecer. */
  minPlayers: 4,
  maxPlayers: 10,
  /** Tempo de desenho. É o número a baixar se a partida cansar. */
  drawingTimeSeconds: 90,
  guessTimeSeconds: 60,
  /** "Passando os cadernos..." — curto de propósito. */
  transitionDurationMs: 1200,
  /** Ritmo do slideshow quando o host liga o auto-play. */
  revealPageMs: 4000,
  /**
   * Folga entre o prazo vencer e a autoridade dar o passo por perdido.
   *
   * Sem ela, um ACK lento no 5G deixaria `advance_phase` preencher `missed`
   * antes de uma segunda tentativa guardar os traços.
   */
  submitGraceMs: 10000,
} as const;

/**
 * Paleta do pincel. Oito cores, e só.
 *
 * Um seletor profissional não cabe aqui: são 90 segundos com o dedo na tela,
 * e escolher cor não pode custar mais que um toque. Cores fechadas também
 * garantem que todas apareçam bem sobre o papel branco.
 */
export const BRUSH_COLORS = [
  "#111111", // preto — padrão
  "#e63946", // vermelho
  "#1d6fe0", // azul
  "#2a9d4a", // verde
  "#f2b705", // amarelo
  "#7b2cbf", // roxo
  "#f4741f", // laranja
  "#8b5e3c", // marrom
] as const;

export const DEFAULT_BRUSH_COLOR = BRUSH_COLORS[0];

/**
 * Três espessuras, em fração do lado menor do canvas.
 *
 * Fração, e não pixel, porque o mesmo traço é revisto em telas de tamanhos
 * diferentes. Três e não um slider: numa festa, arrastar para achar a
 * espessura é tempo que sai do desenho.
 */
export const BRUSH_SIZES = {
  small: 0.006,
  medium: 0.014,
  large: 0.032,
} as const;

export type BrushSize = keyof typeof BRUSH_SIZES;
export const DEFAULT_BRUSH_SIZE: BrushSize = "medium";

/** A borracha acompanha a espessura escolhida, sempre bem mais grossa. */
export const ERASER_FACTOR = 3.5;
