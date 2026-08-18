import { describe, expect, it } from "vitest";
import {
  assigneeIndex,
  chainIndexFor,
  contributionStepCount,
  stepType,
} from "./routing";

/**
 * O roteamento é a peça que NÃO dá para conferir no olho durante uma festa:
 * um caderno indo para a pessoa errada só aparece na revelação, quando a
 * partida já acabou. Por isso as invariantes são afirmadas aqui, para toda
 * sala de 4 a 10, em vez de testadas na mão.
 */
const TAMANHOS = [4, 5, 6, 7, 8, 9, 10];

/** Cada sala, com os passos que ela realmente joga. */
function partida(n: number) {
  const passos = contributionStepCount(n);
  return { n, passos, indices: Array.from({ length: passos }, (_, i) => i) };
}

describe("contagem de passos", () => {
  it("sala par joga um passo por jogador", () => {
    expect(contributionStepCount(4)).toBe(4);
    expect(contributionStepCount(6)).toBe(6);
    expect(contributionStepCount(8)).toBe(8);
    expect(contributionStepCount(10)).toBe(10);
  });

  // O caderno tem de terminar em frase, então a sala ímpar perde um passo.
  it("sala ímpar desce para o par de baixo", () => {
    expect(contributionStepCount(5)).toBe(4);
    expect(contributionStepCount(7)).toBe(6);
    expect(contributionStepCount(9)).toBe(8);
  });

  it("nunca passa do número de jogadores", () => {
    for (const n of TAMANHOS) expect(contributionStepCount(n)).toBeLessThanOrEqual(n);
  });
});

describe.each(TAMANHOS)("sala de %i jogadores", (n) => {
  const { passos, indices } = partida(n);

  it("começa desenhando e termina escrevendo", () => {
    expect(stepType(0)).toBe("draw");
    expect(stepType(passos - 1)).toBe("guess");
  });

  it("alterna desenho e palpite sem falha", () => {
    for (const s of indices) {
      expect(stepType(s)).toBe(s % 2 === 0 ? "draw" : "guess");
    }
  });

  it("todo jogador recebe exatamente um caderno por passo", () => {
    for (const s of indices) {
      const recebidos = Array.from({ length: n }, (_, seat) => chainIndexFor(seat, s, n));
      expect(new Set(recebidos).size).toBe(n);
    }
  });

  it("todo caderno recebe exatamente um contribuidor por passo", () => {
    for (const s of indices) {
      const donos = Array.from({ length: n }, (_, chain) => assigneeIndex(chain, s, n));
      expect(new Set(donos).size).toBe(n);
    }
  });

  it("ninguém pega o mesmo caderno duas vezes", () => {
    for (let chain = 0; chain < n; chain += 1) {
      const passaram = indices.map((s) => assigneeIndex(chain, s, n));
      expect(new Set(passaram).size).toBe(passos);
    }
  });

  it("no passo 0 cada um desenha o próprio tema", () => {
    for (let chain = 0; chain < n; chain += 1) {
      expect(assigneeIndex(chain, 0, n)).toBe(chain);
    }
  });

  /**
   * A invariante que estraga o jogo se falhar: adivinhar um tema que você já
   * conhece. Só o dono conhece o tema, e só porque o desenhou no passo 0.
   */
  it("ninguém adivinha um tema que já conhece", () => {
    for (let chain = 0; chain < n; chain += 1) {
      for (const s of indices) {
        if (stepType(s) !== "guess") continue;
        expect(assigneeIndex(chain, s, n)).not.toBe(chain);
      }
    }
  });

  it("ninguém desenha o próprio palpite", () => {
    for (let chain = 0; chain < n; chain += 1) {
      for (const s of indices.slice(0, -1)) {
        expect(assigneeIndex(chain, s, n)).not.toBe(assigneeIndex(chain, s + 1, n));
      }
    }
  });

  // O giro é o que o jogador sente: "na rodada 2 vejo o caderno do vizinho".
  it("o caderno anda um assento por rodada, sempre no mesmo sentido", () => {
    for (let chain = 0; chain < n; chain += 1) {
      for (const s of indices.slice(0, -1)) {
        const agora = assigneeIndex(chain, s, n);
        const depois = assigneeIndex(chain, s + 1, n);
        expect(depois).toBe((agora + 1) % n);
      }
    }
  });

  it("receber e ser designado são a mesma coisa vista dos dois lados", () => {
    for (const s of indices) {
      for (let seat = 0; seat < n; seat += 1) {
        expect(assigneeIndex(chainIndexFor(seat, s, n), s, n)).toBe(seat);
      }
    }
  });
});
