import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAllDrafts, clearDraft, loadDraft, saveDraft } from "./draft";
import { parseStrokes, serializeStrokes, type Drawing } from "./strokes";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

const drawing: Drawing = [{
  tool: "brush",
  width: 0.014,
  color: 0,
  points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }],
}];
const restoredDrawing = parseStrokes(serializeStrokes(drawing));

describe("rascunho local do desenho", () => {
  beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it("sobrevive ao recarregamento e fica isolado por passo e caderno", () => {
    saveDraft("123456", "p1", 2, "chain-a", drawing);

    expect(loadDraft("123456", "p1", 2, "chain-a")).toEqual(restoredDrawing);
    expect(loadDraft("123456", "p1", 3, "chain-a")).toBeNull();
    expect(loadDraft("123456", "p1", 2, "chain-b")).toBeNull();
  });

  it("só apaga depois da confirmação e limpa apenas a sala pedida", () => {
    saveDraft("111111", "p1", 0, "chain-a", drawing);
    saveDraft("222222", "p1", 0, "chain-b", drawing);

    clearDraft("111111", "p1", 0, "chain-a");
    expect(loadDraft("111111", "p1", 0, "chain-a")).toBeNull();
    expect(loadDraft("222222", "p1", 0, "chain-b")).toEqual(restoredDrawing);

    saveDraft("111111", "p1", 1, "chain-c", drawing);
    clearAllDrafts("111111");
    expect(loadDraft("111111", "p1", 1, "chain-c")).toBeNull();
    expect(loadDraft("222222", "p1", 0, "chain-b")).toEqual(restoredDrawing);
  });

  it("não derruba a tela quando o navegador bloqueia o storage", () => {
    vi.stubGlobal("localStorage", {
      get length(): number { throw new Error("blocked"); },
      clear: () => { throw new Error("blocked"); },
      getItem: () => { throw new Error("blocked"); },
      key: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    } as Storage);

    expect(() => saveDraft("123456", "p1", 0, "c1", drawing)).not.toThrow();
    expect(loadDraft("123456", "p1", 0, "c1")).toBeNull();
    expect(() => clearDraft("123456", "p1", 0, "c1")).not.toThrow();
    expect(() => clearAllDrafts("123456")).not.toThrow();
  });
});
