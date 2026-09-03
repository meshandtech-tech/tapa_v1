import type { PartyState } from "../types";
import type { RoomSnapshot } from "./snapshot";

/**
 * Compare-and-set de comando manual.
 *
 * Postgres envia microssegundos; `PartyState` guarda milissegundos para o
 * relógio da UI. Converter o número de volta para ISO perde precisão e faz o
 * banco recusar um comando legítimo como se a fase já tivesse mudado.
 */
export function expectedPhaseEnd(
  snapshot: RoomSnapshot | null,
  state: Pick<PartyState, "phase" | "phaseDeadline">,
): string | null {
  if (snapshot?.room.phase === state.phase) return snapshot.room.phaseEndsAt;
  return state.phaseDeadline ? new Date(state.phaseDeadline).toISOString() : null;
}
