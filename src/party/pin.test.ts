import { describe, expect, it } from "vitest";
import {
  buildInviteUrl,
  generateFreePin,
  generatePin,
  isValidPin,
  sanitizePinInput,
} from "./pin";

describe("generatePin", () => {
  it("gera sempre 4 dígitos", () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      expect(generatePin()).toMatch(/^\d{4}$/);
    }
  });

  it("produz PINs variados", () => {
    const seen = new Set(Array.from({ length: 100 }, generatePin));
    expect(seen.size).toBeGreaterThan(10);
  });
});

describe("generateFreePin", () => {
  it("sorteia de novo enquanto o PIN estiver ocupado", () => {
    const tried: string[] = [];
    // Os três primeiros sorteios caem em salas existentes; o quarto está livre.
    const pin = generateFreePin((candidate) => {
      tried.push(candidate);
      return tried.length <= 3;
    });

    expect(tried).toHaveLength(4);
    expect(pin).toBe(tried[3]);
  });

  it("para no primeiro PIN livre, sem sortear à toa", () => {
    let calls = 0;
    generateFreePin(() => {
      calls += 1;
      return false;
    });
    expect(calls).toBe(1);
  });

  it("devolve um PIN válido quando nada está ocupado", () => {
    expect(generateFreePin(() => false)).toMatch(/^\d{4}$/);
  });

  // Travar a criação de sala seria pior que reidratar uma antiga.
  it("desiste com um PIN válido se tudo estiver ocupado", () => {
    expect(generateFreePin(() => true, 3)).toMatch(/^\d{4}$/);
  });
});

describe("isValidPin", () => {
  it("aceita 4 dígitos, inclusive começando com zero", () => {
    expect(isValidPin("0000")).toBe(true);
    expect(isValidPin("0042")).toBe(true);
  });

  it("recusa o que não for exatamente 4 dígitos", () => {
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("12345")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
    expect(isValidPin(1234)).toBe(false);
    expect(isValidPin(null)).toBe(false);
  });
});

describe("sanitizePinInput", () => {
  it("descarta não-dígitos e corta em 4", () => {
    expect(sanitizePinInput("1a2b3c4d5")).toBe("1234");
    expect(sanitizePinInput("  12 34  ")).toBe("1234");
    expect(sanitizePinInput("abc")).toBe("");
  });
});

describe("buildInviteUrl", () => {
  it("monta o link de convite", () => {
    expect(buildInviteUrl("1234", "https://tapa.app")).toBe("https://tapa.app/join?pin=1234");
  });

  it("não duplica a barra final", () => {
    expect(buildInviteUrl("1234", "https://tapa.app/")).toBe("https://tapa.app/join?pin=1234");
  });
});
