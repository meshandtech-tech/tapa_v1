import { describe, expect, it } from "vitest";
import { getDeck } from "../data/questions";
import { createPartyState, partyReducer } from "../party/partyReducer";
import { PLAYER_COLORS, ROUND_SECONDS, type PartyState, type Player } from "../party/types";
import {
  currentQuestion,
  drawDifferentPunishment,
  drawOrder,
  everyoneAnswered,
  isCorrectAnswer,
  roundOutcome,
  secondsLeft,
  sequentialOrder,
} from "./quemErraPaga";

function makePlayer(id: string, index: number): Player {
  return {
    id,
    nickname: id,
    color: PLAYER_COLORS[index % PLAYER_COLORS.length],
    avatarSeed: id,
    score: 0,
    joinedAt: 1000 + index,
  };
}

/** Party com N jogadores, já na primeira rodada. */
function emJogo(count: number, now = 0): PartyState {
  let state = createPartyState("1234", 0);
  for (let index = 0; index < count; index += 1) {
    state = partyReducer(state, { type: "PLAYER_JOIN", player: makePlayer(`p${index}`, index) });
  }
  state = partyReducer(state, { type: "START_GAME", order: [0, 1, 2] });
  return partyReducer(state, { type: "ADVANCE", now });
}

const responder = (state: PartyState, playerId: string, optionIndex: number) =>
  partyReducer(state, { type: "ANSWER", playerId, optionIndex });

describe("pergunta da rodada", () => {
  it("segue a ordem sorteada, não a ordem do deck", () => {
    let state = createPartyState("1234", 0);
    state = partyReducer(state, { type: "PLAYER_JOIN", player: makePlayer("a", 0) });
    state = partyReducer(state, { type: "PLAYER_JOIN", player: makePlayer("b", 1) });
    state = partyReducer(state, { type: "START_GAME", order: [4, 2] });
    state = partyReducer(state, { type: "ADVANCE", now: 0 });

    const deck = getDeck("medio");
    expect(currentQuestion(state)?.id).toBe(deck[4].id);
  });

  it("não existe fora de uma rodada", () => {
    expect(currentQuestion(createPartyState("1234", 0))).toBeNull();
  });
});

describe("acerto e erro", () => {
  it("acerta quem marcou a alternativa correta", () => {
    const question = getDeck("medio")[0];
    expect(isCorrectAnswer(question, question.correctAnswer as number)).toBe(true);
  });

  // É o ponto da brincadeira: a mesa inteira paga.
  it("na pegadinha ninguém acerta, escolha o que escolher", () => {
    const pegadinha = getDeck("medio").find((q) => q.correctAnswer === null)!;
    for (const option of [0, 1, 2, 3]) {
      expect(isCorrectAnswer(pegadinha, option)).toBe(false);
    }
  });

  it("quem não respondeu conta como erro", () => {
    const state = emJogo(3);
    const certa = currentQuestion(state)!.correctAnswer as number;
    const depois = responder(state, "p0", certa);

    const { correct, wrong, pending } = roundOutcome(depois);
    expect(correct.map((p) => p.id)).toEqual(["p0"]);
    expect(wrong.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(pending.map((p) => p.id)).toEqual(["p1", "p2"]);
  });
});

describe("registro de respostas", () => {
  it("aceita a resposta de quem está na sala", () => {
    const state = responder(emJogo(2), "p0", 2);
    expect(state.quiz?.answers).toEqual({ p0: 2 });
  });

  // Sem isso dava para esperar a cara dos outros e trocar.
  it("não deixa trocar a resposta", () => {
    let state = responder(emJogo(2), "p0", 1);
    state = responder(state, "p0", 3);
    expect(state.quiz?.answers.p0).toBe(1);
  });

  it("ignora quem não está na sala", () => {
    const state = responder(emJogo(2), "intruso", 1);
    expect(state.quiz?.answers).toEqual({});
  });

  it("ignora alternativa fora do intervalo", () => {
    let state = responder(emJogo(2), "p0", 9);
    state = responder(state, "p1", -1);
    expect(state.quiz?.answers).toEqual({});
  });

  it("só aceita durante a rodada", () => {
    const revelando = partyReducer(emJogo(2), { type: "ADVANCE" });
    const state = responder(revelando, "p0", 1);
    expect(state.quiz?.answers).toEqual({});
  });

  it("sabe quando todo mundo já respondeu", () => {
    let state = emJogo(2);
    expect(everyoneAnswered(state)).toBe(false);
    state = responder(state, "p0", 0);
    expect(everyoneAnswered(state)).toBe(false);
    state = responder(state, "p1", 0);
    expect(everyoneAnswered(state)).toBe(true);
  });
});

describe("pontuação", () => {
  it("dá um ponto por acerto ao revelar", () => {
    let state = emJogo(3);
    const certa = currentQuestion(state)!.correctAnswer as number;
    state = responder(state, "p0", certa);
    state = responder(state, "p1", certa === 0 ? 1 : 0);
    state = partyReducer(state, { type: "ADVANCE" });

    expect(state.players.find((p) => p.id === "p0")?.score).toBe(1);
    expect(state.players.find((p) => p.id === "p1")?.score).toBe(0);
    expect(state.players.find((p) => p.id === "p2")?.score).toBe(0);
  });
});

describe("cronômetro", () => {
  it("arma o prazo ao abrir a rodada", () => {
    const state = emJogo(2, 10_000);
    expect(state.quiz?.deadline).toBe(10_000 + ROUND_SECONDS * 1000);
    expect(secondsLeft(state, 10_000)).toBe(ROUND_SECONDS);
  });

  it("nunca fica negativo", () => {
    const state = emJogo(2, 0);
    expect(secondsLeft(state, 999_999)).toBe(0);
  });

  it("zera as respostas a cada nova rodada", () => {
    let state = responder(emJogo(2, 0), "p0", 0);
    state = partyReducer(state, { type: "ADVANCE" });
    state = partyReducer(state, { type: "ADVANCE", punishmentIndex: 3 });
    while (state.phase !== "ROUND_ACTIVE") {
      state = partyReducer(state, { type: "ADVANCE", now: 50_000 });
    }
    expect(state.round).toBe(2);
    expect(state.quiz?.answers).toEqual({});
    expect(state.quiz?.punishmentIndex).toBeNull();
  });
});

describe("recusar a prenda", () => {
  it("troca a prenda sem sair da roleta", () => {
    let state = emJogo(2);
    state = partyReducer(state, { type: "ADVANCE" });
    state = partyReducer(state, { type: "ADVANCE", punishmentIndex: 4 });
    expect(state.phase).toBe("FORFEIT_WHEEL");

    state = partyReducer(state, { type: "REROLL_PUNISHMENT", punishmentIndex: 9 });
    expect(state.phase).toBe("FORFEIT_WHEEL");
    expect(state.quiz?.punishmentIndex).toBe(9);
  });

  it("não vale fora da roleta", () => {
    const state = emJogo(2);
    const depois = partyReducer(state, { type: "REROLL_PUNISHMENT", punishmentIndex: 3 });
    expect(depois).toBe(state);
  });

  // Cair na mesma prenda transformaria a válvula de escape em piada.
  it("nunca sorteia a prenda que acabou de sair", () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      expect(drawDifferentPunishment(12, 7)).not.toBe(7);
    }
  });

  it("aguenta um pool de uma prenda só sem travar", () => {
    expect(drawDifferentPunishment(1, 0)).toBe(0);
  });
});

describe("sorteio da ordem", () => {
  it("nunca pede mais perguntas do que o deck tem", () => {
    expect(drawOrder(5, 10)).toHaveLength(5);
    expect(sequentialOrder(5, 10)).toHaveLength(5);
  });

  it("não repete pergunta na mesma partida", () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const order = drawOrder(13, 10);
      expect(new Set(order).size).toBe(order.length);
      expect(order.every((index) => index >= 0 && index < 13)).toBe(true);
    }
  });
});
