/**
 * A foto da sala, do jeito que o servidor devolve.
 *
 * Estes tipos espelham `room_snapshot()` (migration 0006). Um round-trip traz
 * tudo o que ESTE jogador pode ver, já filtrado pelo Postgres — o cliente não
 * decide mais o que é segredo, e por isso reconectar virou uma leitura só em
 * vez de uma reconstrução de estado.
 */
import type { GameId, PartyPhase, SubmissionStatus } from "../types";

export interface SnapshotRoom {
  id: string;
  pin: string;
  gameId: GameId;
  phase: PartyPhase;
  /** ISO. Instante absoluto — o cliente desenha a contagem a partir dele. */
  phaseEndsAt: string | null;
  pausedAt: string | null;
  round: number;
  settings: Record<string, unknown>;
  hostPlayerId: string | null;
  closedAt: string | null;
}

export interface SnapshotPlayer {
  id: string;
  nickname: string;
  color: string;
  avatarSeed: string;
  score: number;
  joinedAt: string;
  lastSeenAt: string;
}

export interface SnapshotMatch {
  id: string;
  gameId: GameId;
  seatOrder: string[];
  stepIndex: number;
  stepCount: number;
  submittedPlayerIds: string[];
  presenterIndex: number;
  revealChainIndex: number;
  revealPageIndex: number;
  revealAutoplay: boolean;
  questionOrder: number[];
  slideIds: string[];
  punishmentIndex: number | null;
  /** Identidades (`source:id`) das fatias da roleta desta rodada. */
  topicCandidates: string[];
  /** Índice do vencedor dentro de `topicCandidates`. */
  topicWinner: number;
}

/** A ÚNICA página que esta pessoa pode ver agora. */
export interface SnapshotAssignment {
  chainId: string;
  stepIndex: number;
  /** Passo 0: o tema secreto do próprio caderno. */
  prompt: string | null;
  previous: {
    kind: "drawing" | "guess";
    text: string;
    storagePath: string | null;
    strokes: unknown;
    status: SubmissionStatus;
  } | null;
}

/**
 * Um tema do acervo da partida.
 *
 * `id` + `source` juntos são a identidade — um tema do host e um do sistema
 * são itens DISTINTOS mesmo com o mesmo texto. Era a falta disso que fazia a
 * roleta cair "no mesmo número" e mostrar outro tema.
 */
export interface SnapshotTopic {
  id: string;
  source: "custom" | "default";
  text: string;
  position: number;
  usedAt: string | null;
  rejectedAt: string | null;
  presenterId: string | null;
}

export interface SnapshotPage {
  stepIndex: number;
  kind: "drawing" | "guess";
  playerId: string;
  storagePath: string | null;
  strokes: unknown;
  text: string;
  status: SubmissionStatus;
}

export interface SnapshotChain {
  id: string;
  ownerPlayerId: string;
  position: number;
  originalPrompt: string;
  countedAsMatch: boolean;
  pages: SnapshotPage[];
}

export interface RoomSnapshot {
  room: SnapshotRoom;
  me: { playerId: string | null; submitted: boolean };
  players: SnapshotPlayer[];
  match: SnapshotMatch | null;
  assignment: SnapshotAssignment | null;
  topics: SnapshotTopic[];
  /** Preenchido só na revelação. Antes disso entregaria a piada. */
  chains: SnapshotChain[];
  serverTime: string;
  error?: string;
}
