import { describe, expect, it } from "vitest";
import { drawingFallbackMessage } from "./DrawingReplay";
import type { DrawingPageDraw } from "../../party/types";

function page(status: DrawingPageDraw["status"]): DrawingPageDraw {
  return { type: "drawing", playerId: "p1", url: null, status };
}

describe("fallback da revelação", () => {
  it("distingue folha em branco de jogador que não enviou", () => {
    expect(drawingFallbackMessage(page("submitted"))).toBe("Folha em branco");
    expect(drawingFallbackMessage(page("missed"))).toContain("não enviou");
  });

  it("explica falha de conteúdo e falha da imagem sem quebrar a página", () => {
    expect(drawingFallbackMessage(page("failed"))).toContain("não pôde ser recuperado");
    expect(drawingFallbackMessage(page("submitted"), true)).toContain("não pôde ser carregada");
  });
});
