import { describe, expect, it, vi } from "vitest";
import {
  isBlank,
  parseStrokes,
  replayStrokes,
  serializeStrokes,
  simplifyStroke,
  type Drawing,
  type ReplayContext,
} from "./strokes";

const traco: Drawing = [
  { tool: "brush", width: 0.012, points: [{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.6 }, { x: 0.9, y: 0.4 }] },
  { tool: "eraser", width: 0.05, points: [{ x: 0.3, y: 0.3 }, { x: 0.35, y: 0.35 }] },
];

describe("serialização", () => {
  it("volta igual ao que entrou", () => {
    const volta = parseStrokes(serializeStrokes(traco));
    expect(volta).not.toBeNull();
    expect(volta).toHaveLength(2);
    expect(volta![0].tool).toBe("brush");
    expect(volta![1].tool).toBe("eraser");
    expect(volta![0].points).toHaveLength(3);
    // Quantizado na grade: igual até onde o olho vê, não bit a bit.
    expect(volta![0].points[0].x).toBeCloseTo(0.1, 3);
    expect(volta![0].points[2].y).toBeCloseTo(0.4, 3);
    expect(volta![1].width).toBeCloseTo(0.05, 3);
  });

  it("é bem menor que o traço cru", () => {
    const muitos: Drawing = [
      {
        tool: "brush",
        width: 0.012,
        points: Array.from({ length: 300 }, (_, i) => ({ x: i / 300, y: (i % 50) / 50 })),
      },
    ];
    expect(serializeStrokes(muitos).length).toBeLessThan(JSON.stringify(muitos).length / 2);
  });

  it("recusa lixo em vez de estourar", () => {
    expect(parseStrokes(null)).toBeNull();
    expect(parseStrokes("")).toBeNull();
    expect(parseStrokes("{")).toBeNull();
    expect(parseStrokes('{"v":99,"s":[]}')).toBeNull();
    expect(parseStrokes('{"v":1,"g":2048,"s":"nada"}')).toBeNull();
    // Coordenada sem par: dado truncado no meio do caminho.
    expect(parseStrokes('{"v":1,"g":2048,"s":[[0,24,10,20,30]]}')).toBeNull();
  });

  it("prende coordenada fora da faixa dentro de 0..1", () => {
    const fora = parseStrokes('{"v":1,"g":2048,"s":[[0,24,-500,99999]]}');
    expect(fora![0].points[0]).toEqual({ x: 0, y: 1 });
  });
});

describe("cor e compatibilidade de formato", () => {
  it("leva a cor escolhida na ida e na volta", () => {
    const coloridos: Drawing = [
      { tool: "brush", width: 0.014, color: 3, points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }] },
      { tool: "brush", width: 0.032, color: 7, points: [{ x: 0.2, y: 0.8 }, { x: 0.8, y: 0.2 }] },
    ];
    const volta = parseStrokes(serializeStrokes(coloridos))!;
    expect(volta.map((t) => t.color)).toEqual([3, 7]);
    expect(volta[1].width).toBeCloseTo(0.032, 3);
  });

  /**
   * Rascunho salvo no celular de alguém ANTES da cor existir não pode virar
   * tela em branco no meio da rodada.
   */
  it("ainda lê rascunho no formato antigo, como preto", () => {
    const antigo = '{"v":1,"g":2048,"s":[[0,25,246,614,308,702]]}';
    const volta = parseStrokes(antigo)!;
    expect(volta).toHaveLength(1);
    expect(volta[0].color).toBe(0);
    expect(volta[0].points).toHaveLength(2);
  });

  it("recusa v2 truncado no meio de uma coordenada", () => {
    expect(parseStrokes('{"v":2,"g":2048,"s":[[0,25,3,10,20,30]]}')).toBeNull();
  });

  it("pinta cada traço com a cor da paleta", () => {
    const ctx = dubleDeContexto();
    replayStrokes(
      ctx.api,
      [{ tool: "brush", width: 0.02, color: 1, points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }] }],
      400, 400,
      ["#111111", "#e63946"],
    );
    expect(ctx.api.strokeStyle).toBe("#e63946");
  });

  it("cor fora da paleta cai na primeira, sem quebrar", () => {
    const ctx = dubleDeContexto();
    replayStrokes(
      ctx.api,
      [{ tool: "brush", width: 0.02, color: 99, points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }] }],
      400, 400,
      ["#111111", "#e63946"],
    );
    expect(ctx.api.strokeStyle).toBe("#111111");
  });
});

describe("independência de tela", () => {
  /**
   * A razão de existir das coordenadas normalizadas: o mesmo desenho tem de
   * cair no mesmo lugar relativo em qualquer viewport, inclusive depois de
   * girar o aparelho no meio dos 90 segundos.
   */
  it("cai no mesmo lugar relativo em qualquer tamanho", () => {
    const strokes = parseStrokes(serializeStrokes(traco))!;
    const retrato = pontosDesenhados(strokes, 390, 844);
    const paisagem = pontosDesenhados(strokes, 844, 390);
    expect(retrato[0].x / 390).toBeCloseTo(paisagem[0].x / 844, 5);
    expect(retrato[0].y / 844).toBeCloseTo(paisagem[0].y / 390, 5);
  });
});

describe("simplifyStroke", () => {
  it("descarta pontos praticamente em cima do anterior", () => {
    const juntos = Array.from({ length: 100 }, (_, i) => ({ x: 0.5 + i * 0.00001, y: 0.5 }));
    expect(simplifyStroke(juntos).length).toBeLessThan(5);
  });

  it("mantém o traço que realmente andou", () => {
    const longe = [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }];
    expect(simplifyStroke(longe)).toHaveLength(3);
  });

  // Onde o dedo levantou define o fim do traço; perder isso encurta o desenho.
  it("nunca perde o último ponto", () => {
    const pontos = Array.from({ length: 50 }, (_, i) => ({ x: 0.5 + i * 0.00001, y: 0.5 }));
    const saida = simplifyStroke(pontos);
    expect(saida[saida.length - 1]).toEqual(pontos[pontos.length - 1]);
  });
});

describe("isBlank", () => {
  it("reconhece entrega em branco", () => {
    expect(isBlank([])).toBe(true);
    expect(isBlank([{ tool: "brush", width: 0.01, points: [] }])).toBe(true);
    expect(isBlank(traco)).toBe(false);
  });
});

describe("replayStrokes", () => {
  it("fura o desenho na borracha e pinta no pincel", () => {
    const ctx = dubleDeContexto();
    replayStrokes(ctx.api, traco, 400, 400);
    expect(ctx.composites).toContain("destination-out");
    expect(ctx.composites).toContain("source-over");
    // Volta ao normal no fim: senão a próxima coisa desenhada apagaria a tela.
    expect(ctx.api.globalCompositeOperation).toBe("source-over");
  });

  it("desenha uma bolinha quando foi só um toque", () => {
    const ctx = dubleDeContexto();
    replayStrokes(ctx.api, [{ tool: "brush", width: 0.02, points: [{ x: 0.5, y: 0.5 }] }], 400, 400);
    expect(ctx.api.arc).toHaveBeenCalled();
    expect(ctx.api.stroke).not.toHaveBeenCalled();
  });

  it("ignora traço sem ponto nenhum", () => {
    const ctx = dubleDeContexto();
    replayStrokes(ctx.api, [{ tool: "brush", width: 0.02, points: [] }], 400, 400);
    expect(ctx.api.beginPath).not.toHaveBeenCalled();
  });
});

/** Dublê de canvas: guarda o que foi pedido, sem precisar de DOM. */
function dubleDeContexto() {
  const composites: string[] = [];
  let atual: GlobalCompositeOperation = "source-over";
  const api = {
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(),
    lineWidth: 0, lineCap: "butt", lineJoin: "miter",
    strokeStyle: "", fillStyle: "",
  } as unknown as ReplayContext;
  // Propriedade acessada para saber a ORDEM das trocas, não só o valor final.
  Object.defineProperty(api, "globalCompositeOperation", {
    get: () => atual,
    set: (valor: GlobalCompositeOperation) => { atual = valor; composites.push(valor); },
  });
  return { api, composites };
}

function pontosDesenhados(strokes: Drawing, largura: number, altura: number) {
  const pontos: Array<{ x: number; y: number }> = [];
  const ctx = {
    beginPath: () => {}, stroke: () => {}, fill: () => {}, arc: () => {},
    moveTo: (x: number, y: number) => pontos.push({ x, y }),
    lineTo: (x: number, y: number) => pontos.push({ x, y }),
    quadraticCurveTo: (_x: number, _y: number, x: number, y: number) => pontos.push({ x, y }),
    lineWidth: 0, lineCap: "round", lineJoin: "round",
    strokeStyle: "", fillStyle: "", globalCompositeOperation: "source-over",
  } as unknown as ReplayContext;
  replayStrokes(ctx, strokes, largura, altura);
  return pontos;
}
