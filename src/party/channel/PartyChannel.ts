import type { PartyState, Player } from "../types";

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
