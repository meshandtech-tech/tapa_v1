/**
 * Ajustes do Apresentação Improvisada, num lugar só.
 *
 * Nenhum componente repete estes números: as durações do registry derivam
 * daqui, e mudar o ritmo da partida inteira é mudar uma linha.
 */
export const IMPROV_SLIDES_CONFIG = {
  slidesPerPresentation: 5,
  preparationTimeSeconds: 20,
  slideDurationSeconds: 20,
  /** Abaixo de 3 não há plateia suficiente para a votação fazer sentido. */
  minPlayers: 3,
  maxPlayers: 10,
  /**
   * Mostrar o primeiro slide já na preparação — SÓ para quem vai apresentar.
   *
   * Começou `false`, na versão difícil. Jogando de verdade ficou claro que 20
   * segundos encarando um cronômetro sem nenhuma pista não é preparação, é
   * espera: a pessoa entrava no slide 1 sem ter por onde começar. Vendo a
   * primeira imagem, ela já monta a abertura da história — e os outros quatro
   * slides continuam sendo surpresa, que é onde o jogo realmente mora.
   *
   * A plateia NÃO vê. Só o celular de quem apresenta.
   */
  showFirstSlideDuringPreparation: true,
  /** Transição entre slides. Curta de propósito: são só 20 segundos cada. */
  slideTransitionMs: 280,
} as const;

export const SLIDE_DURATION_MS = IMPROV_SLIDES_CONFIG.slideDurationSeconds * 1000;

/** 5 slides x 20s = 100s. É a duração da fase PRESENTATION deste jogo. */
export const PRESENTATION_TOTAL_MS =
  IMPROV_SLIDES_CONFIG.slidesPerPresentation * SLIDE_DURATION_MS;

/**
 * Rótulos de estrutura narrativa, um por slide.
 *
 * Existem porque o pedido é uma HISTÓRIA com começo, meio e fim — e sem uma
 * pista de onde está no arco, a pessoa descobre que era o último slide quando
 * ele acaba. Discretos de propósito: quem faz a piada é a imagem.
 */
export const SLIDE_BEATS: readonly string[] = [
  "O começo",
  "Desenvolve",
  "A virada",
  "Encaminha",
  "O grand finale",
];
