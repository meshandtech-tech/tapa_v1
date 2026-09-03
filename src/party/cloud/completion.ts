import type { RoomSnapshot } from "./snapshot";

type CompletionSnapshot = Pick<RoomSnapshot, "room" | "match" | "answers">;

/**
 * A foto do servidor já contém somente os participantes da partida e os ids
 * de quem terminou. Isso permite avisar o banco assim que todos acabarem, sem
 * esperar o prazo máximo e sem revelar respostas ou conteúdo de desenhos.
 *
 * O retorno nunca muda a fase sozinho: `advance_phase` ainda valida tudo no
 * Supabase e seu compare-and-set decide qual chamada vence.
 */
export function cloudPhaseCompleteEarly(snapshot: CompletionSnapshot): boolean {
  const match = snapshot.match;
  const seats = match?.seatOrder ?? [];
  if (!match || seats.length === 0) return false;

  if (
    snapshot.room.gameId === "drawing-telephone"
    && (snapshot.room.phase === "DRAW_STEP" || snapshot.room.phase === "GUESS_STEP")
  ) {
    const submitted = new Set(match.submittedPlayerIds);
    return seats.every((playerId) => submitted.has(playerId));
  }

  if (
    snapshot.room.gameId === "quem-erra-paga"
    && snapshot.room.phase === "ROUND_ACTIVE"
  ) {
    // Durante a pergunta, respostas alheias chegam mascaradas como `-1`.
    // A presença da chave diz que a pessoa respondeu sem entregar a opção.
    return seats.every((playerId) =>
      Object.prototype.hasOwnProperty.call(snapshot.answers, playerId));
  }

  return false;
}
