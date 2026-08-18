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
   * Sem ela, um upload lento no wi-fi do bar apagaria um desenho que a pessoa
   * fez inteiro — o traço estava pronto, só a rede que demorou.
   */
  submitGraceMs: 3000,
} as const;

/** Largura do traço, em fração do lado menor do canvas. Escala com a tela. */
export const BRUSH_WIDTHS = {
  brush: 0.012,
  eraser: 0.05,
} as const;
