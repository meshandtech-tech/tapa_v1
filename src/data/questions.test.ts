import { describe, expect, it } from "vitest";
import { questions, validateQuestions } from "./questions";

describe("question data", () => {
  it("contains 20 valid alternating questions, ten per player", () => {
    expect(() => validateQuestions(questions)).not.toThrow();
    expect(questions.filter((question) => question.player === "Lucas")).toHaveLength(10);
    expect(questions.filter((question) => question.player === "Samuel")).toHaveLength(10);
    expect(questions[11].correctAnswer).toBeNull();
    expect(questions[13].correctAnswer).toBe(1);
    expect(questions[17].correctAnswer).toBe(1);
  });
});
