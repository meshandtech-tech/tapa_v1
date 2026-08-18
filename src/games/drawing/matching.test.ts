import { describe, expect, it } from "vitest";
import { answersMatch, looseAnswer, normalizeAnswer } from "./matching";

describe("normalizeAnswer", () => {
  it("tira acento, caixa e pontuação", () => {
    expect(normalizeAnswer("Macaco!")).toBe("macaco");
    expect(normalizeAnswer("AVIÃO")).toBe("aviao");
    expect(normalizeAnswer("pão-de-queijo")).toBe("pao de queijo");
  });

  it("colapsa espaço repetido e das pontas", () => {
    expect(normalizeAnswer("  cachorro   grande ")).toBe("cachorro grande");
  });

  it("aguenta string vazia e só pontuação", () => {
    expect(normalizeAnswer("")).toBe("");
    expect(normalizeAnswer("???")).toBe("");
  });
});

describe("looseAnswer", () => {
  it("tira artigo e preposição", () => {
    expect(looseAnswer("um cachorro pilotando uma moto")).toBe("cachorro pilotando moto");
  });

  // Sem isto, "a" viraria "" e casaria com qualquer outra frase vazia.
  it("não deixa a frase virar vazio", () => {
    expect(looseAnswer("a")).toBe("a");
    expect(looseAnswer("de")).toBe("de");
  });
});

describe("answersMatch", () => {
  it("aceita a mesma resposta escrita de outro jeito", () => {
    expect(answersMatch("Macaco!", "macaco")).toBe(true);
    expect(answersMatch("  AVIAO ", "avião")).toBe(true);
    expect(answersMatch("um cachorro pilotando uma moto", "Cachorro pilotando moto")).toBe(true);
  });

  it("aceita as respostas alternativas do tema", () => {
    expect(answersMatch("smartphone", "celular", ["telefone", "smartphone"])).toBe(true);
    expect(answersMatch("Telefone", "celular", ["telefone"])).toBe(true);
  });

  it("recusa o que é realmente diferente", () => {
    expect(answersMatch("gato", "cachorro")).toBe(false);
    expect(answersMatch("", "cachorro")).toBe(false);
    expect(answersMatch("   ", "cachorro")).toBe(false);
  });

  // O host resolve estes na mão — a máquina não deve chutar sinônimo.
  it("não inventa sinônimo", () => {
    expect(answersMatch("automóvel", "carro")).toBe(false);
  });
});
