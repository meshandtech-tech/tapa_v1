import type { PartyState, Player } from "../party/types";

/**
 * Participantes congelados quando a partida começou.
 *
 * Quem chega depois pertence à sala e entra na próxima partida, mas não pode
 * alterar resposta, voto, contador ou ranking da partida que já estava em
 * andamento. Reconexões continuam aqui porque preservam o mesmo id/assento.
 */
export function currentMatchPlayerIds(state: PartyState): string[] {
  if (state.quiz) {
    return state.quiz.participantIds ?? state.players.map((player) => player.id);
  }
  if (state.devil) return state.devil.order;
  if (state.drawing) return state.drawing.seatOrder;
  if (state.slides) return state.slides.order;
  return state.players.map((player) => player.id);
}

export function currentMatchPlayers(state: PartyState): Player[] {
  const byId = new Map(state.players.map((player) => [player.id, player]));
  return currentMatchPlayerIds(state)
    .map((id) => byId.get(id))
    .filter((player): player is Player => !!player);
}

export function isCurrentMatchParticipant(state: PartyState, playerId: string): boolean {
  return currentMatchPlayerIds(state).includes(playerId);
}
