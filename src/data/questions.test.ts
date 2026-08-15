import { describe, expect, it } from "vitest";
import { DIFFICULTIES } from "../party/types";
import { QUESTION_DECKS, getDeck, validateAllDecks, validateQuestions } from "./questions";

describe("decks de perguntas", () => {
  it("os três decks são válidos e não repetem ids entre si", () => {
    expect(() => validateAllDecks()).not.toThrow();
  });

  it("existe um deck por dificuldade, todos não vazios", () => {
    DIFFICULTIES.forEach((difficulty) => {
      const deck = getDeck(difficulty);
      expect(deck.length).toBeGreaterThan(0);
      expect(() => validateQuestions(deck)).not.toThrow();
    });
  });

  it("toda pergunta tem quatro alternativas não vazias", () => {
    Object.values(QUESTION_DECKS).forEach((deck) => {
      deck.forEach((question) => {
        expect(question.options).toHaveLength(4);
        expect(question.options.every((option) => option.trim().length > 0)).toBe(true);
        expect(question.question.trim().length).toBeGreaterThan(0);
      });
    });
  });

  it("cada deck tem exatamente uma pegadinha sem resposta certa", () => {
    DIFFICULTIES.forEach((difficulty) => {
      const traps = getDeck(difficulty).filter((question) => question.correctAnswer === null);
      expect(traps).toHaveLength(1);
    });
  });

  it("validateQuestions recusa ids duplicados", () => {
    const duplicated = [
      { id: 1, question: "a", options: ["a", "b", "c", "d"], correctAnswer: 0 },
      { id: 1, question: "b", options: ["a", "b", "c", "d"], correctAnswer: 1 },
    ] as const;
    expect(() => validateQuestions(duplicated)).toThrow(/duplicado/);
  });

  it("validateQuestions recusa deck vazio", () => {
    expect(() => validateQuestions([])).toThrow();
  });

  it("getDeck cai no deck médio se a dificuldade não existir", () => {
    // @ts-expect-error validando o caminho defensivo com entrada inválida
    expect(getDeck("inexistente")).toBe(QUESTION_DECKS.medium);
  });
});
