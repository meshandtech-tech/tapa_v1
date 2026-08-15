import { describe, expect, it } from "vitest";
import { getDeck } from "../data/questions";
import { createGameState, currentPlayer, gameReducer } from "./gameReducer";
import type { GameState } from "../types/game";

const PLAYERS = ["Ana", "Bruno"] as const;
const DECK = getDeck("medium");

function startGame(): GameState {
  return gameReducer(createGameState(PLAYERS), {
    type: "START_NEW",
    players: PLAYERS,
    difficulty: "medium",
  });
}

/** Índice da alternativa certa da pergunta n do deck em uso. */
function rightAnswer(index: number): number {
  const answer = DECK[index].correctAnswer;
  if (answer === null) throw new Error(`A pergunta ${index} é pegadinha, não tem resposta certa.`);
  return answer;
}

describe("gameReducer", () => {
  it("começa limpo, na primeira pergunta e no primeiro jogador do roster", () => {
    const state = startGame();
    expect(state.screen).toBe("question");
    expect(state.currentQuestionIndex).toBe(0);
    expect(state.scores).toEqual({ Ana: 0, Bruno: 0 });
    expect(currentPlayer(state)).toBe("Ana");
  });

  it("gira o turno pelo roster, seja qual for o tamanho", () => {
    const trio = gameReducer(createGameState(["Ana", "Bruno", "Cadu"]), {
      type: "START_NEW",
      players: ["Ana", "Bruno", "Cadu"],
      difficulty: "medium",
    });
    expect(currentPlayer(trio)).toBe("Ana");
    const second = gameReducer(trio, { type: "ADMIN_NEXT" });
    expect(currentPlayer(second)).toBe("Bruno");
    const third = gameReducer(second, { type: "ADMIN_NEXT" });
    expect(currentPlayer(third)).toBe("Cadu");
    const fourth = gameReducer(third, { type: "ADMIN_NEXT" });
    expect(currentPlayer(fourth)).toBe("Ana");
  });

  it("pontua um acerto exatamente uma vez e avança", () => {
    const started = startGame();
    const answered = gameReducer(started, { type: "ANSWER", optionIndex: rightAnswer(0) });
    const duplicate = gameReducer(answered, { type: "ANSWER", optionIndex: rightAnswer(0) });
    const advanced = gameReducer(duplicate, { type: "FEEDBACK_COMPLETE" });

    expect(answered.screen).toBe("correct-feedback");
    expect(duplicate.scores.Ana).toBe(1);
    expect(duplicate.history).toHaveLength(1);
    expect(advanced.currentQuestionIndex).toBe(1);
    expect(advanced.scores).toEqual({ Ana: 1, Bruno: 0 });
  });

  it("manda o erro para a roleta sem pontuar", () => {
    const wrong = (rightAnswer(0) + 1) % 4;
    const answered = gameReducer(startGame(), { type: "ANSWER", optionIndex: wrong });
    const wheel = gameReducer(answered, { type: "FEEDBACK_COMPLETE" });
    const result = gameReducer(wheel, { type: "WHEEL_COMPLETE", punishmentIndex: 7 });

    expect(answered.screen).toBe("wrong-feedback");
    expect(answered.scores.Ana).toBe(0);
    expect(wheel.screen).toBe("wheel");
    expect(result.screen).toBe("punishment-result");
    expect(result.currentPunishmentIndex).toBe(7);
    expect(result.history[0].punishmentIndex).toBe(7);
  });

  it("registra um pulo administrativo e desfaz", () => {
    const skipped = gameReducer(startGame(), { type: "ADMIN_NEXT" });
    expect(skipped.currentQuestionIndex).toBe(1);
    expect(skipped.history[0]).toMatchObject({ skipped: true, scoreDelta: 0, player: "Ana" });

    const restored = gameReducer(skipped, { type: "ADMIN_BACK" });
    expect(restored.currentQuestionIndex).toBe(0);
    expect(restored.history).toHaveLength(0);
    expect(restored.scores).toEqual({ Ana: 0, Bruno: 0 });
  });

  it("desfaz um acerto sem deixar ponto duplicado", () => {
    const answered = gameReducer(startGame(), { type: "ANSWER", optionIndex: rightAnswer(0) });
    const restored = gameReducer(answered, { type: "ADMIN_BACK" });
    const answeredAgain = gameReducer(restored, { type: "ANSWER", optionIndex: rightAnswer(0) });

    expect(restored.scores.Ana).toBe(0);
    expect(answeredAgain.scores.Ana).toBe(1);
    expect(answeredAgain.history).toHaveLength(1);
  });

  it("na pegadinha, TODA alternativa conta como erro", () => {
    const trapIndex = DECK.findIndex((question) => question.correctAnswer === null);
    expect(trapIndex).toBeGreaterThanOrEqual(0);

    let state = startGame();
    for (let index = 0; index < trapIndex; index += 1) {
      state = gameReducer(state, { type: "ADMIN_NEXT" });
    }

    for (let optionIndex = 0; optionIndex < 4; optionIndex += 1) {
      const answered = gameReducer(state, { type: "ANSWER", optionIndex });
      expect(answered.screen).toBe("wrong-feedback");
      expect(answered.scores).toEqual({ Ana: 0, Bruno: 0 });
    }
  });

  it("termina ao fim do deck e preserva o empate", () => {
    let state = startGame();
    for (let index = 0; index < DECK.length; index += 1) {
      state = gameReducer(state, { type: "ADMIN_NEXT" });
    }

    expect(state.screen).toBe("final");
    expect(state.history).toHaveLength(DECK.length);
    expect(state.scores).toEqual({ Ana: 0, Bruno: 0 });
  });

  it("cada dificuldade joga o seu próprio deck", () => {
    const easy = gameReducer(createGameState(PLAYERS), {
      type: "START_NEW",
      players: PLAYERS,
      difficulty: "easy",
    });
    expect(easy.difficulty).toBe("easy");
    expect(getDeck("easy")[0].id).not.toBe(getDeck("hard")[0].id);
  });

  it("ação desconhecida devolve o mesmo estado, nunca lança", () => {
    const before = startGame();
    const bogus = { type: "NAO_EXISTE" } as unknown as Parameters<typeof gameReducer>[1];
    expect(() => gameReducer(before, bogus)).not.toThrow();
    expect(gameReducer(before, bogus)).toBe(before);
  });
});
