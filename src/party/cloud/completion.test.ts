import { describe, expect, it } from "vitest";
import { cloudPhaseCompleteEarly } from "./completion";
import type { RoomSnapshot } from "./snapshot";

function snapshot({
  gameId = "quem-erra-paga",
  phase = "ROUND_ACTIVE",
  seats = ["p1", "p2"],
  submitted = [],
  answers = {},
}: {
  gameId?: RoomSnapshot["room"]["gameId"];
  phase?: RoomSnapshot["room"]["phase"];
  seats?: string[];
  submitted?: string[];
  answers?: Record<string, number>;
} = {}) {
  return {
    room: { gameId, phase },
    match: { seatOrder: seats, submittedPlayerIds: submitted },
    answers,
  } as Pick<RoomSnapshot, "room" | "match" | "answers">;
}

describe("cloudPhaseCompleteEarly", () => {
  it("fecha o quiz quando todos os participantes da partida responderam", () => {
    expect(cloudPhaseCompleteEarly(snapshot({ answers: { p1: 2, p2: -1 } }))).toBe(true);
  });

  it("não confunde alternativa mascarada com ausência de resposta", () => {
    expect(cloudPhaseCompleteEarly(snapshot({ answers: { p1: -1 } }))).toBe(false);
  });

  it("ignora respostas externas e exige somente os assentos da partida", () => {
    expect(cloudPhaseCompleteEarly(snapshot({
      seats: ["p1", "p2"],
      answers: { p1: 0, p2: -1, late: -1 },
    }))).toBe(true);
  });

  it("preserva a conclusão antecipada dos passos de desenho", () => {
    expect(cloudPhaseCompleteEarly(snapshot({
      gameId: "drawing-telephone",
      phase: "DRAW_STEP",
      submitted: ["p1", "p2"],
    }))).toBe(true);
  });

  it("não antecipa fases ou jogos sem conclusão coletiva", () => {
    expect(cloudPhaseCompleteEarly(snapshot({ phase: "REVEAL_ANSWER" }))).toBe(false);
    expect(cloudPhaseCompleteEarly(snapshot({ gameId: "advogado-do-diabo" }))).toBe(false);
    expect(cloudPhaseCompleteEarly(snapshot({ seats: [] }))).toBe(false);
  });
});
