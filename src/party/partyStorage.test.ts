import { describe, expect, it } from "vitest";
import { createPartyState } from "./partyReducer";
import { parsePartyState } from "./partyStorage";
import type { PartyState } from "./types";

/** Estado válido, serializado, com um campo adulterado. */
function raw(mutate: (state: PartyState) => void = () => {}): string {
  const state = createPartyState("1234", 1000);
  mutate(state);
  return JSON.stringify(state);
}

describe("parsePartyState", () => {
  it("aceita um estado íntegro", () => {
    const parsed = parsePartyState(raw());
    expect(parsed?.pin).toBe("1234");
    expect(parsed?.settings.themeId).toBe("red-hot");
    expect(parsed?.settings.themeMode).toBe("manual");
  });

  it("preserva o tema escolhido pelo host", () => {
    const parsed = parsePartyState(
      raw((state) => {
        state.settings.themeId = "cyber-yellow";
        state.settings.themeMode = "auto";
      }),
    );
    expect(parsed?.settings.themeId).toBe("cyber-yellow");
    expect(parsed?.settings.themeMode).toBe("auto");
  });

  // Um preset inexistente deixaria o ThemeProvider sem cor para aplicar.
  it("recusa themeId desconhecido", () => {
    expect(
      parsePartyState(raw((state) => Object.assign(state.settings, { themeId: "roxo" }))),
    ).toBeNull();
  });

  it("recusa themeMode desconhecido", () => {
    expect(
      parsePartyState(raw((state) => Object.assign(state.settings, { themeMode: "meio" }))),
    ).toBeNull();
  });

  it("recusa estado sem os campos de tema", () => {
    expect(
      parsePartyState(
        raw((state) => {
          delete (state.settings as Partial<PartyState["settings"]>).themeId;
        }),
      ),
    ).toBeNull();
  });

  it("recusa lixo", () => {
    expect(parsePartyState(null)).toBeNull();
    expect(parsePartyState("{")).toBeNull();
    expect(parsePartyState("{}")).toBeNull();
  });
});
