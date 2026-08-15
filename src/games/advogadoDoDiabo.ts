import { findTopic, getTopics } from "../data/topics";
import type { CustomTopic, DevilState, PartyState, Player } from "../party/types";
import { DEVIL_WHEEL_SIZE } from "./registry";

/**
 * Regras puras do "Advogado do Diabo". Sem React e sem estado externo: a TV e
 * os celulares chamam as MESMAS funções sobre o MESMO PartyState.
 */

/** Texto de um tema, venha ele do sistema ou do host. */
export function topicText(id: string, custom: readonly CustomTopic[]): string {
  const feito = custom.find((topic) => topic.id === id);
  if (feito) return feito.text;
  return findTopic(id)?.text ?? "Tema perdido — pule este";
}

/** Tema sorteado nesta rodada. `null` antes do sorteio. */
export function currentTopicId(state: PartyState): string | null {
  const devil = state.devil;
  if (!devil || devil.candidates.length === 0) return null;
  return devil.candidates[devil.winner] ?? null;
}

export function currentTopicText(state: PartyState): string {
  const id = currentTopicId(state);
  if (!id || !state.devil) return "";
  return topicText(id, state.devil.customTopics);
}

/** Quem apresenta agora. `null` fora de uma rodada. */
export function currentPresenter(state: PartyState): Player | null {
  const devil = state.devil;
  if (!devil || devil.index < 0) return null;
  const id = devil.order[devil.index];
  return state.players.find((player) => player.id === id) ?? null;
}

/** Ainda não apresentaram. Usado só para a animação de sorteio. */
export function remainingPresenters(state: PartyState): Player[] {
  const devil = state.devil;
  if (!devil) return [];
  const jaForam = new Set(devil.order.slice(0, Math.max(0, devil.index + 1)));
  return state.players.filter((player) => !jaForam.has(player.id));
}

/** Quem pode votar: todo mundo menos quem está apresentando. */
export function eligibleVoters(state: PartyState): Player[] {
  const presenter = currentPresenter(state);
  return state.players.filter((player) => player.id !== presenter?.id);
}

export function votesIn(state: PartyState): number {
  return Object.keys(state.devil?.votes ?? {}).length;
}

/** Média das notas da rodada, ou `null` se ninguém votou. */
export function roundAverage(state: PartyState): number | null {
  const votos = Object.values(state.devil?.votes ?? {});
  if (votos.length === 0) return null;
  const soma = votos.reduce((total, nota) => total + nota, 0);
  return Math.round((soma / votos.length) * 10) / 10;
}

/** Ranking final por nota média, desempatando por quem entrou primeiro. */
export function devilLeaderboard(state: PartyState): { player: Player; score: number }[] {
  const scores = state.devil?.scores ?? {};
  return state.players
    .map((player) => ({ player, score: scores[player.id] ?? 0 }))
    .sort((a, b) => b.score - a.score || a.player.joinedAt - b.player.joinedAt);
}

function shuffle<T>(items: readonly T[]): T[] {
  const pool = [...items];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  return pool;
}

/**
 * Monta os candidatos da roleta desta rodada.
 *
 * Teses do host entram PRIMEIRO. Sem isso elas se perderiam no meio de ~50
 * temas do sistema e o host nunca veria aparecer o que escreveu — que é
 * justamente a graça de ter escrito.
 */
export function drawCandidates(state: PartyState): string[] {
  const devil = state.devil;
  if (!devil) return [];
  const usados = new Set(devil.usedTopics);

  const doHost = devil.customTopics.map((topic) => topic.id).filter((id) => !usados.has(id));
  const doSistema = getTopics(state.settings.difficulty)
    .map((topic) => topic.id)
    .filter((id) => !usados.has(id));

  const pool = [...shuffle(doHost), ...shuffle(doSistema)];
  // Acabaram os temas inéditos: recomeça em vez de travar a festa.
  if (pool.length === 0) {
    return shuffle(getTopics(state.settings.difficulty).map((topic) => topic.id)).slice(
      0,
      DEVIL_WHEEL_SIZE,
    );
  }
  return pool.slice(0, Math.min(DEVIL_WHEEL_SIZE, pool.length));
}

export function createDevilState(
  players: readonly Player[],
  customTopics: readonly CustomTopic[],
): DevilState {
  return {
    order: shuffle(players.map((player) => player.id)),
    index: -1,
    candidates: [],
    winner: 0,
    usedTopics: [],
    customTopics: [...customTopics],
    votes: {},
    scores: {},
    disclaimerAccepted: false,
  };
}

/** Todo mundo já apresentou? */
export function everyonePresented(state: PartyState): boolean {
  const devil = state.devil;
  if (!devil) return false;
  return devil.index >= devil.order.length - 1;
}
