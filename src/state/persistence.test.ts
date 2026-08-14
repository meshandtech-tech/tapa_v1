import { describe, expect, it } from "vitest";
import { getDeck } from "../data/questions";
import { createGameState, gameReducer } from "./gameReducer";
import { parseSavedGame, serializeGameState, stateForPersistence } from "./persistence";

const PLAYERS = ["Ana", "Bruno"] as const;
const DECK = getDeck("medio");
const RIGHT = DECK[0].correctAnswer as number;
const WRONG = (RIGHT + 1) % 4;

function started() {
  return gameReducer(createGameState(PLAYERS), {
    type: "START_NEW",
    players: PLAYERS,
    difficulty: "medio",
  });
}

describe("persistência do quiz", () => {
  it("não persiste a tela inicial intocada", () => {
    expect(serializeGameState(createGameState(PLAYERS))).toBeNull();
  });

  it("restaura um jogo estável e recalcula a pontuação pelo histórico", () => {
    const answered = gameReducer(started(), { type: "ANSWER", optionIndex: RIGHT });
    const restored = parseSavedGame(serializeGameState(answered));

    expect(restored?.screen).toBe("question");
    expect(restored?.currentQuestionIndex).toBe(1);
    expect(restored?.scores).toEqual({ Ana: 1, Bruno: 0 });
    expect(restored?.players).toEqual(["Ana", "Bruno"]);
  });

  it("restaura um erro interrompido na roleta pronta para girar", () => {
    const answered = gameReducer(started(), { type: "ANSWER", optionIndex: WRONG });
    expect(stateForPersistence(answered)?.screen).toBe("wheel");
    expect(parseSavedGame(serializeGameState(answered))?.screen).toBe("wheel");
  });

  it("mantém a prenda sorteada depois de um refresh", () => {
    let state = gameReducer(started(), { type: "ANSWER", optionIndex: WRONG });
    state = gameReducer(state, { type: "FEEDBACK_COMPLETE" });
    state = gameReducer(state, { type: "WHEEL_COMPLETE", punishmentIndex: 4 });
    const restored = parseSavedGame(serializeGameState(state));

    expect(restored?.screen).toBe("punishment-result");
    expect(restored?.currentPunishmentIndex).toBe(4);
  });

  it("preserva a dificuldade escolhida", () => {
    const facil = gameReducer(createGameState(PLAYERS), {
      type: "START_NEW",
      players: PLAYERS,
      difficulty: "facil",
    });
    const answered = gameReducer(facil, {
      type: "ANSWER",
      optionIndex: getDeck("facil")[0].correctAnswer as number,
    });
    expect(parseSavedGame(serializeGameState(answered))?.difficulty).toBe("facil");
  });

  it("aceita roster de qualquer tamanho", () => {
    const trio = ["Ana", "Bruno", "Cadu"];
    let state = gameReducer(createGameState(trio), {
      type: "START_NEW",
      players: trio,
      difficulty: "medio",
    });
    state = gameReducer(state, { type: "ADMIN_NEXT" });
    state = gameReducer(state, { type: "ADMIN_NEXT" });
    const restored = parseSavedGame(serializeGameState(state));
    expect(restored?.players).toEqual(trio);
    expect(restored?.history.map((record) => record.player)).toEqual(["Ana", "Bruno"]);
  });

  it("rejeita saves corrompidos, de versão desconhecida e inconsistentes", () => {
    expect(parseSavedGame("not-json")).toBeNull();
    expect(parseSavedGame(JSON.stringify({ version: 2 }))).toBeNull();

    // Índice adiantado em relação ao histórico.
    expect(parseSavedGame(JSON.stringify({
      version: 1,
      screen: "question",
      difficulty: "medio",
      players: ["Ana", "Bruno"],
      currentQuestionIndex: 5,
      scores: { Ana: 99, Bruno: 99 },
      history: [],
      selectedAnswer: null,
      currentPunishmentIndex: null,
    }))).toBeNull();
  });

  it("rejeita dificuldade inválida e roster vazio ou duplicado", () => {
    const base = {
      version: 1,
      screen: "question",
      currentQuestionIndex: 0,
      history: [],
      selectedAnswer: null,
      currentPunishmentIndex: null,
    };
    expect(parseSavedGame(JSON.stringify({ ...base, difficulty: "impossivel", players: ["Ana"] }))).toBeNull();
    expect(parseSavedGame(JSON.stringify({ ...base, difficulty: "medio", players: [] }))).toBeNull();
    expect(parseSavedGame(JSON.stringify({ ...base, difficulty: "medio", players: ["Ana", "Ana"] }))).toBeNull();
  });

  it("rejeita histórico que não bate com o rodízio de turnos", () => {
    const answered = gameReducer(started(), { type: "ANSWER", optionIndex: RIGHT });
    const tampered = JSON.parse(serializeGameState(answered)!);
    tampered.history[0].player = "Bruno"; // a pergunta 0 é da Ana
    expect(parseSavedGame(JSON.stringify(tampered))).toBeNull();
  });
});
