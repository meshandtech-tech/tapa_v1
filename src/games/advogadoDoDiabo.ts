import { findTopic, getTopics } from "../data/topics";
import {
  isTopicAvailable,
  type CustomTopic,
  type DevilState,
  type MatchTopic,
  type PartyState,
  type Player,
} from "../party/types";
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

/**
 * O tema que a roleta escolheu. `null` antes do sorteio.
 *
 * Devolve o ITEM inteiro, não o id: quem chama precisa da identidade completa
 * (`source` + `id`) para nunca confundir uma tese do host com uma do sistema.
 */
export function currentTopic(state: PartyState): MatchTopic | null {
  const devil = state.devil;
  if (!devil || devil.candidates.length === 0) return null;
  return devil.candidates[devil.winner] ?? null;
}

export function currentTopicText(state: PartyState): string {
  return currentTopic(state)?.text ?? "";
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
 * Quanto tema entra no acervo de uma partida.
 *
 * Finito de propósito. O jogo não é um gerador infinito: o host configura um
 * punhado de teses, elas saem uma a uma, e a mesa consegue ver o acervo
 * diminuir. Imprevisibilidade vem do embaralhamento, não de um sorteio novo a
 * cada rodada.
 */
/**
 * Dez apresentações no máximo + dez trocas de segurança.
 *
 * Antes o acervo tinha exatamente dez itens. Numa sala cheia, trocar UMA tese
 * desconfortável consumia a única sobra inexistente e o último apresentador
 * recebia uma tese vazia. Vinte mantém o acervo finito, mas torna verdadeiro o
 * botão "trocar tese" mesmo no pior tamanho de sala.
 */
export const DEFAULT_TOPIC_POOL_SIZE = 20;

/**
 * Monta o acervo da partida — uma vez, no início.
 *
 * As teses do host entram TODAS e primeiro: escrever uma tese e nunca vê-la
 * aparecer é o pior resultado possível. O resto completa com o sistema até o
 * tamanho pedido, e o conjunto inteiro é embaralhado.
 */
export function buildTopicPool(
  custom: readonly CustomTopic[],
  difficulty: PartyState["settings"]["difficulty"],
  size = DEFAULT_TOPIC_POOL_SIZE,
  /** Injetável para o teste não depender de sorte. */
  embaralhar: <T>(items: readonly T[]) => T[] = shuffle,
): MatchTopic[] {
  const doHost: MatchTopic[] = custom.map((topic) => ({
    id: topic.id, source: "custom", text: topic.text,
    position: 0, usedAt: null, rejectedAt: null, presenterId: null,
  }));

  const faltam = Math.max(0, size - doHost.length);
  const doSistema: MatchTopic[] = embaralhar(getTopics(difficulty))
    .slice(0, faltam)
    .map((topic) => ({
      id: topic.id, source: "default", text: topic.text,
      position: 0, usedAt: null, rejectedAt: null, presenterId: null,
    }));

  return embaralhar([...doHost, ...doSistema]).map((topic, indice) => ({
    ...topic,
    position: indice,
  }));
}

/** Chave de identidade. Custom e sistema nunca colidem, mesmo com id igual. */
export function topicKey(topic: MatchTopic): string {
  return `${topic.source}:${topic.id}`;
}

/** O que ainda pode sair nesta partida. */
export function availableTopics(devil: DevilState): MatchTopic[] {
  return devil.pool.filter(isTopicAvailable).sort((a, b) => a.position - b.position);
}

/**
 * As fatias da roleta desta rodada.
 *
 * Saem do acervo restante, em ordem de posição. A roleta mostra só o que
 * ainda existe — ela nunca exibe um tema já usado, então "caiu no mesmo de
 * novo" deixa de ser possível.
 */
export function drawCandidates(state: PartyState): MatchTopic[] {
  const devil = state.devil;
  if (!devil) return [];
  return availableTopics(devil).slice(0, DEVIL_WHEEL_SIZE);
}

export function createDevilState(
  players: readonly Player[],
  customTopics: readonly CustomTopic[],
  pool: readonly MatchTopic[] = [],
): DevilState {
  return {
    order: shuffle(players.map((player) => player.id)),
    index: -1,
    pool: [...pool],
    candidates: [],
    winner: 0,
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
