import { describe, expect, it } from "vitest";
import { gameReducer, initialGameState } from "./gameReducer";
import { parseSavedGame, serializeGameState, stateForPersistence } from "./persistence";

describe("game persistence", () => {
  it("does not persist the untouched opening screen", () => {
    expect(serializeGameState(initialGameState)).toBeNull();
  });

  it("restores a valid stable game and recomputes scores from history", () => {
    const started = gameReducer(initialGameState, { type: "START_NEW" });
    const answered = gameReducer(started, { type: "ANSWER", optionIndex: 2 });
    const serialized = serializeGameState(answered);
    const restored = parseSavedGame(serialized);

    expect(restored?.screen).toBe("question");
    expect(restored?.currentQuestionIndex).toBe(1);
    expect(restored?.scores).toEqual({ Lucas: 1, Samuel: 0 });
  });

  it("restores an interrupted error feedback at the ready-to-spin wheel", () => {
    const started = gameReducer(initialGameState, { type: "START_NEW" });
    const answered = gameReducer(started, { type: "ANSWER", optionIndex: 0 });
    expect(stateForPersistence(answered)?.screen).toBe("wheel");
    expect(parseSavedGame(serializeGameState(answered))?.screen).toBe("wheel");
  });

  it("keeps a selected punishment across refreshes", () => {
    let state = gameReducer(initialGameState, { type: "START_NEW" });
    state = gameReducer(state, { type: "ANSWER", optionIndex: 0 });
    state = gameReducer(state, { type: "FEEDBACK_COMPLETE" });
    state = gameReducer(state, { type: "WHEEL_COMPLETE", punishmentIndex: 4 });
    const restored = parseSavedGame(serializeGameState(state));

    expect(restored?.screen).toBe("punishment-result");
    expect(restored?.currentPunishmentIndex).toBe(4);
  });

  it("rejects corrupt, unknown-version, and inconsistent saves", () => {
    expect(parseSavedGame("not-json")).toBeNull();
    expect(parseSavedGame(JSON.stringify({ version: 2 }))).toBeNull();
    expect(parseSavedGame(JSON.stringify({
      version: 1,
      screen: "question",
      currentQuestionIndex: 5,
      scores: { Lucas: 99, Samuel: 99 },
      history: [],
      selectedAnswer: null,
      currentPunishmentIndex: null,
    }))).toBeNull();
  });
});
