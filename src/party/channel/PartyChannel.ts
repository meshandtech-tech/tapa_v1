import type { Difficulty, GameId, PartyState, Player, ThemeId, ThemeMode } from "../types";

/**
 * O que o host pode mandar do celular dele.
 *
 * É um subconjunto fechado de propósito: `HYDRATE` carregaria um estado
 * inteiro, e aceitar isso pela rede deixaria qualquer participante reescrever
 * a sala. O host manda intenções; quem calcula continua sendo a TV.
 */
export type HostCommand =
  | { type: "SET_GAME"; gameId: GameId }
  | { type: "SET_DIFFICULTY"; difficulty: Difficulty }
  | { type: "SET_THEME"; themeId?: ThemeId; themeMode?: ThemeMode }
  | { type: "START_GAME" }
  | { type: "ADVANCE" }
  | { type: "REROLL_PUNISHMENT" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "RESET_TO_LOBBY" };

/**
 * Eventos que trafegam entre TV e celulares.
 *
 * O Host é a ÚNICA autoridade sobre o estado: os players enviam intenções
 * (entrar, mudar avatar) e recebem de volta o estado inteiro em `STATE`.
 * Nenhum player calcula fase — é isso que impede duas telas divergirem.
 */
export type PartyEvent =
  | { type: "PLAYER_JOIN"; player: Player }
  | { type: "PLAYER_LEAVE"; playerId: string }
  | { type: "PLAYER_UPDATE"; playerId: string; patch: Partial<Omit<Player, "id">> }
  /** Player → host. "marquei a alternativa N". O host decide se vale. */
  | { type: "ANSWER"; playerId: string; optionIndex: number }
  /** Host → TV. A TV confere se `playerId` é mesmo o host antes de aplicar. */
  | { type: "HOST_ACTION"; playerId: string; command: HostCommand }
  /** Player → host. "eu sou o dono desta sala" (token guardado no aparelho). */
  | { type: "CLAIM_HOST"; playerId: string }
  /** Host → todos. Estado completo e autoritativo. */
  | { type: "STATE"; state: PartyState }
  /** Player → host. "acabei de chegar, me manda o estado". */
  | { type: "REQUEST_STATE" }
  /** Host → todos. A sala não existe mais. */
  | { type: "PARTY_CLOSED" };

export type PartyEventHandler = (event: PartyEvent) => void;

/**
 * Contrato de transporte da party.
 *
 * Hoje implementado com BroadcastChannel (duas abas na mesma máquina).
 * Na Fase 2 entra um SupabaseRealtimeAdapter com esta MESMA interface —
 * nenhuma tela precisa mudar, só a fábrica em `./index.ts`.
 */
export interface PartyChannel {
  readonly pin: string;
  subscribe: (handler: PartyEventHandler) => () => void;
  broadcast: (event: PartyEvent) => void;
  close: () => void;
}

export function channelName(pin: string): string {
  return `tapa:party:${pin}`;
}
