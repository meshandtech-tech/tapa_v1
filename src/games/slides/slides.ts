import type { PartyState, Player, SlidesState } from "../../party/types";
import {
  IMPROV_SLIDES_CONFIG,
  PRESENTATION_TOTAL_MS,
  SLIDE_DURATION_MS,
} from "./config";
import { currentMatchPlayers } from "../participants";

/**
 * Lógica pura do Apresentação Improvisada.
 *
 * Nada aqui sorteia por conta própria: quem sorteia é a autoridade e o
 * resultado entra como argumento. É o que garante que TV e celulares nunca
 * discordem sobre qual slide está no ar.
 */

export function createSlidesState(
  players: readonly Player[],
  order: readonly string[],
  usedSlideIds: readonly string[] = [],
): SlidesState {
  return {
    order: order.length > 0 ? [...order] : players.map((player) => player.id),
    index: -1,
    slideIds: [],
    usedSlideIds: [...usedSlideIds],
    votes: {},
    scores: {},
    instructionsSeen: false,
  };
}

export function currentPresenter(state: PartyState): Player | null {
  const slides = state.slides;
  if (!slides || slides.index < 0) return null;
  const id = slides.order[slides.index];
  return state.players.find((player) => player.id === id) ?? null;
}

/** Todo mundo já apresentou uma vez? Ninguém repete antes disso. */
export function everyonePresented(state: PartyState): boolean {
  const slides = state.slides;
  if (!slides) return false;
  return slides.index >= slides.order.length - 1;
}

/**
 * Escolhe os slides de uma apresentação.
 *
 * Duas regras, nesta ordem de prioridade: **nunca repetir dentro da mesma
 * apresentação** (obrigatório) e **evitar o que saiu recentemente** (só se
 * sobrar imagem). A segunda cede para a primeira — com acervo pequeno, insistir
 * em variedade deixaria alguém com menos de cinco slides, que é pior.
 */
export function pickSlides(
  pool: readonly string[],
  usedIds: readonly string[],
  quantidade: number = IMPROV_SLIDES_CONFIG.slidesPerPresentation,
  random: () => number = Math.random,
): string[] {
  if (pool.length === 0) return [];

  const usados = new Set(usedIds);
  const frescos = pool.filter((id) => !usados.has(id));
  // Embaralha o que é fresco e, atrás, o que já saiu: assim o reaproveitamento
  // começa pelos menos recentes sem nunca faltar imagem.
  const ordenado = [...shuffle(frescos, random), ...shuffle(pool.filter((id) => usados.has(id)), random)];

  const escolhidos: string[] = [];
  for (const id of ordenado) {
    if (escolhidos.includes(id)) continue;
    escolhidos.push(id);
    if (escolhidos.length === quantidade) break;
  }
  return escolhidos;
}

/**
 * Troca somente as posições cujas imagens falharam no pré-carregamento.
 *
 * A lista original inteira fica fora do sorteio das reservas: uma URL que já
 * falhou não pode voltar na mesma tentativa, e um slide bom não deve mudar de
 * posição só porque outro arquivo quebrou.
 */
export function replaceFailedSlides(
  slideIds: readonly string[],
  failedIds: readonly string[],
  pool: readonly string[],
  random: () => number = Math.random,
): string[] | null {
  const atuais = new Set(slideIds);
  const falharam = new Set(failedIds.filter((id) => atuais.has(id)));
  if (falharam.size === 0) return [...slideIds];

  const reservas = pickSlides(
    pool.filter((id) => !atuais.has(id)),
    [],
    falharam.size,
    random,
  );
  // Nunca manda uma apresentação incompleta para o servidor.
  if (reservas.length !== falharam.size) return null;

  let proxima = 0;
  return slideIds.map((id) => (falharam.has(id) ? reservas[proxima++] : id));
}

/** Fisher-Yates com cópia; a lista de origem nunca é mexida. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const saida = [...items];
  for (let i = saida.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [saida[i], saida[j]] = [saida[j], saida[i]];
  }
  return saida;
}

/** Memória curta de imagens já usadas, para dar variedade sem esgotar o acervo. */
export function rememberSlides(
  usedSlideIds: readonly string[],
  novos: readonly string[],
  tamanhoDoAcervo: number,
): string[] {
  const juntos = [...usedSlideIds, ...novos];
  // Guarda no máximo o acervo menos uma apresentação: sempre sobra de onde tirar.
  const teto = Math.max(0, tamanhoDoAcervo - IMPROV_SLIDES_CONFIG.slidesPerPresentation);
  return juntos.slice(Math.max(0, juntos.length - teto));
}

export interface SlideProgress {
  /** 0 a 4. */
  index: number;
  /** Quanto falta do slide atual. */
  remainingMs: number;
  isLast: boolean;
}

/**
 * Qual slide está no ar, derivado do prazo da fase.
 *
 * **Não existe estado de slide.** A fase `PRESENTATION` já tem `phaseDeadline`,
 * então o início é `deadline - 100s` e o slide é a divisão do tempo decorrido.
 * Guardar `currentSlideStartedAt` seria um segundo relógio para manter em
 * sincronia — e dois relógios divergem. Aqui, aparelho nenhum pode discordar:
 * todos fazem a mesma conta sobre o mesmo número.
 */
export function slideProgress(state: PartyState, now: number): SlideProgress {
  const inicio = state.phaseDeadline - PRESENTATION_TOTAL_MS;
  // Pausado, o relógio congela onde parou.
  const instante = state.pausedAt ?? now;
  const decorrido = Math.min(
    Math.max(instante - inicio, 0),
    PRESENTATION_TOTAL_MS - 1,
  );
  const index = Math.floor(decorrido / SLIDE_DURATION_MS);
  return {
    index,
    remainingMs: SLIDE_DURATION_MS - (decorrido % SLIDE_DURATION_MS),
    isLast: index === IMPROV_SLIDES_CONFIG.slidesPerPresentation - 1,
  };
}

/** Quem pode votar: todo mundo menos quem está apresentando. */
export function eligibleVoters(state: PartyState): Player[] {
  const apresentador = currentPresenter(state);
  return currentMatchPlayers(state).filter((player) => player.id !== apresentador?.id);
}

export function votesIn(state: PartyState): number {
  const eligible = new Set(eligibleVoters(state).map((player) => player.id));
  return Object.keys(state.slides?.votes ?? {}).filter((id) => eligible.has(id)).length;
}

/** Média da rodada, com uma casa. `null` quando ninguém votou. */
export function roundAverage(state: PartyState): number | null {
  const eligible = new Set(eligibleVoters(state).map((player) => player.id));
  const votos = Object.entries(state.slides?.votes ?? {})
    .filter(([id]) => eligible.has(id))
    .map(([, rating]) => rating);
  if (votos.length === 0) return null;
  const soma = votos.reduce((total, nota) => total + nota, 0);
  return Math.round((soma / votos.length) * 10) / 10;
}

/** Ranking por nota média, desempatando por quem entrou primeiro. */
export function slidesRanking(state: PartyState): Array<{ player: Player; score: number }> {
  const notas = state.slides?.scores ?? {};
  return currentMatchPlayers(state)
    .map((player) => ({ player, score: notas[player.id] ?? 0 }))
    .sort((a, b) => b.score - a.score || a.player.joinedAt - b.player.joinedAt);
}
