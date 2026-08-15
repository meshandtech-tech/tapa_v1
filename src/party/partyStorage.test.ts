import { describe, expect, it } from "vitest";
import { createPartyState } from "./partyReducer";
import { parsePartyState } from "./partyStorage";
import type { PartyPhase, PartyState } from "./types";

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

describe("fases persistíveis", () => {
  /**
   * Regressão: quando as fases do Advogado do Diabo entraram, a whitelist de
   * `partyStorage` ficou para trás e todo estado desse jogo era descartado ao
   * recarregar — um F5 no meio da partida derrubava a sala em silêncio.
   */
  it("aceita TODA fase declarada em PartyPhase", () => {
    const todas: PartyPhase[] = [
      "LOBBY", "GAME_INTRO", "LEADERBOARD", "GAME_OVER",
      "ROUND_ACTIVE", "REVEAL_ANSWER", "FORFEIT_WHEEL",
      "TOPIC_SPIN", "TOPIC_REVEAL", "PLAYER_SPIN", "PLAYER_REVEAL",
      "PREPARATION", "COUNTDOWN", "PRESENTATION", "VOTING", "SCORE_REVEAL",
    ];
    for (const phase of todas) {
      const parsed = parsePartyState(raw((state) => { state.phase = phase; }));
      expect(parsed, `fase ${phase} foi rejeitada`).not.toBeNull();
    }
  });

  it("recusa fase inventada", () => {
    expect(parsePartyState(raw((s) => Object.assign(s, { phase: "VOANDO" })))).toBeNull();
  });
});
