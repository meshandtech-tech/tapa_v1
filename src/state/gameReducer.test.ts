import { describe, expect, it } from "vitest";
import { gameReducer, initialGameState } from "./gameReducer";
import type { GameState } from "../types/game";

function startGame(): GameState {
  return gameReducer(initialGameState, { type: "START_NEW" });
}

describe("gameReducer", () => {
  it("starts a clean game on Lucas's first question", () => {
    const state = startGame();
    expect(state.screen).toBe("question");
    expect(state.currentQuestionIndex).toBe(0);
    expect(state.scores).toEqual({ Lucas: 0, Samuel: 0 });
  });

  it("awards a correct answer exactly once and advances", () => {
    const started = startGame();
    const answered = gameReducer(started, { type: "ANSWER", optionIndex: 2 });
    const duplicate = gameReducer(answered, { type: "ANSWER", optionIndex: 2 });
    const advanced = gameReducer(duplicate, { type: "FEEDBACK_COMPLETE" });

    expect(answered.screen).toBe("correct-feedback");
    expect(duplicate.scores.Lucas).toBe(1);
    expect(duplicate.history).toHaveLength(1);
    expect(advanced.currentQuestionIndex).toBe(1);
    expect(advanced.scores).toEqual({ Lucas: 1, Samuel: 0 });
  });

  it("sends a wrong answer to the wheel without scoring", () => {
    const answered = gameReducer(startGame(), { type: "ANSWER", optionIndex: 0 });
    const wheel = gameReducer(answered, { type: "FEEDBACK_COMPLETE" });
    const result = gameReducer(wheel, { type: "WHEEL_COMPLETE", punishmentIndex: 7 });

    expect(answered.screen).toBe("wrong-feedback");
    expect(answered.scores.Lucas).toBe(0);
    expect(wheel.screen).toBe("wheel");
    expect(result.screen).toBe("punishment-result");
    expect(result.currentPunishmentIndex).toBe(7);
    expect(result.history[0].punishmentIndex).toBe(7);
  });

  it("records an administrative skip and reverses it", () => {
    const skipped = gameReducer(startGame(), { type: "ADMIN_NEXT" });
    expect(skipped.currentQuestionIndex).toBe(1);
    expect(skipped.history[0]).toMatchObject({ skipped: true, scoreDelta: 0 });

    const restored = gameReducer(skipped, { type: "ADMIN_BACK" });
    expect(restored.currentQuestionIndex).toBe(0);
    expect(restored.history).toHaveLength(0);
    expect(restored.scores).toEqual({ Lucas: 0, Samuel: 0 });
  });

  it("reverses a scored answer without leaving a duplicate point", () => {
    const answered = gameReducer(startGame(), { type: "ANSWER", optionIndex: 2 });
    const restored = gameReducer(answered, { type: "ADMIN_BACK" });
    const answeredAgain = gameReducer(restored, { type: "ANSWER", optionIndex: 2 });

    expect(restored.scores.Lucas).toBe(0);
    expect(answeredAgain.scores.Lucas).toBe(1);
    expect(answeredAgain.history).toHaveLength(1);
  });

  it("treats every option on question 12 as wrong", () => {
    let state = startGame();
    for (let index = 0; index < 11; index += 1) state = gameReducer(state, { type: "ADMIN_NEXT" });

    for (let optionIndex = 0; optionIndex < 4; optionIndex += 1) {
      const answered = gameReducer(state, { type: "ANSWER", optionIndex });
      expect(answered.screen).toBe("wrong-feedback");
      expect(answered.scores.Samuel).toBe(0);
    }
  });

  it("finishes after all 20 questions and preserves a tie", () => {
    let state = startGame();
    for (let index = 0; index < 20; index += 1) {
      state = gameReducer(state, { type: "ADMIN_NEXT" });
    }

    expect(state.screen).toBe("final");
    expect(state.history).toHaveLength(20);
    expect(state.scores).toEqual({ Lucas: 0, Samuel: 0 });
  });
});
