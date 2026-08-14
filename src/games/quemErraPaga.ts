import { getDeck } from "../data/questions";
import type { PartyState, Player } from "../party/types";
import type { Question } from "../types/game";

/**
 * Regras puras do "Quem Erra, Paga". Sem React e sem acesso a estado externo:
 * a TV e os celulares chamam as MESMAS funções sobre o MESMO PartyState, então
 * é impossível uma tela discordar da outra sobre quem acertou.
 */

/** Pergunta da rodada atual. `null` fora de uma rodada válida. */
export function currentQuestion(state: PartyState): Question | null {
  if (!state.quiz || state.round < 1) return null;
  const deck = getDeck(state.settings.difficulty);
  const index = state.quiz.order[state.round - 1];
  return deck[index] ?? null;
}

/**
 * Acertou = respondeu exatamente a alternativa correta.
 *
 * Nas pegadinhas (`correctAnswer: null`) NINGUÉM acerta — é o ponto da
 * brincadeira: a mesa inteira paga.
 */
export function isCorrectAnswer(question: Question, answer: number | undefined): boolean {
  if (question.correctAnswer === null) return false;
  return answer === question.correctAnswer;
}

export interface RoundOutcome {
  question: Question | null;
  /** Quem marcou a alternativa certa. */
  correct: Player[];
  /** Quem errou OU deixou o tempo acabar sem responder. */
  wrong: Player[];
  /** Quem ainda não respondeu — usado para o contador ao vivo na TV. */
  pending: Player[];
}

/** Resultado da rodada corrente, do ponto de vista de qualquer tela. */
export function roundOutcome(state: PartyState): RoundOutcome {
  const question = currentQuestion(state);
  const answers = state.quiz?.answers ?? {};

  if (!question) {
    return { question: null, correct: [], wrong: [], pending: [] };
  }

  const correct: Player[] = [];
  const wrong: Player[] = [];
  const pending: Player[] = [];

  for (const player of state.players) {
    const answer = answers[player.id];
    if (answer === undefined) pending.push(player);
    // Quem não respondeu conta como erro na hora de pagar a prenda.
    if (isCorrectAnswer(question, answer)) correct.push(player);
    else wrong.push(player);
  }

  return { question, correct, wrong, pending };
}

/** Todo mundo já respondeu? A TV usa isso para não esperar o tempo à toa. */
export function everyoneAnswered(state: PartyState): boolean {
  if (state.players.length === 0) return false;
  const answers = state.quiz?.answers ?? {};
  return state.players.every((player) => answers[player.id] !== undefined);
}

/** Segundos restantes, nunca negativo. */
export function secondsLeft(state: PartyState, now: number): number {
  if (!state.quiz) return 0;
  return Math.max(0, Math.ceil((state.quiz.deadline - now) / 1000));
}

function randomInt(max: number): number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] % max;
  }
  return Math.floor(Math.random() * max);
}

/**
 * Ordem das perguntas da partida. O deck tem mais perguntas do que rodadas,
 * então sortear (em vez de ler em sequência) faz duas partidas seguidas com a
 * mesma dificuldade não caírem nas mesmas perguntas.
 *
 * Quem sorteia é o HOST, e o resultado viaja dentro do estado — assim a TV e
 * os celulares veem a mesma pergunta sem precisar sortear de novo.
 */
export function drawOrder(deckLength: number, rounds: number): number[] {
  const pool = Array.from({ length: deckLength }, (_, index) => index);
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  return pool.slice(0, Math.min(rounds, deckLength));
}

/** Ordem previsível — usada como fallback e nos testes. */
export function sequentialOrder(deckLength: number, rounds: number): number[] {
  return Array.from({ length: Math.min(rounds, deckLength) }, (_, index) => index);
}

export function drawPunishment(total: number): number {
  return randomInt(Math.max(1, total));
}

/**
 * Sorteia uma prenda DIFERENTE da atual. Usado quando ninguém topa pagar:
 * cair na mesma prenda de novo transformaria a válvula de escape em piada.
 */
export function drawDifferentPunishment(total: number, current: number | null): number {
  if (total <= 1) return 0;
  let next = randomInt(total);
  while (next === current) next = randomInt(total);
  return next;
}
