import { useEffect } from "react";
import { presentationTheme } from "../games/identity";
import { getGame } from "../games/registry";
import { useTheme } from "../theme/useTheme";
import { getPreset } from "../theme/presets";
import type { PartyState } from "./types";

/**
 * Espelha a cor da party no documento deste aparelho.
 *
 * O tema é autoritativo do host e viaja dentro de `PartyState`, que já é
 * broadcast inteiro a cada mudança. Montado na TV E nos celulares, é isto que
 * garante que todo mundo veja a MESMA cor — inclusive quando o modo `auto`
 * gira o preset na virada da rodada.
 *
 * Fora de uma sala (`null`), não faz nada: a landing continua com o tema local.
 */
export function usePartyTheme(state: PartyState | null): void {
  const { themeId, mode, setThemeId, setMode } = useTheme();
  const partyThemeId = state?.settings.themeId;
  const partyThemeMode = state?.settings.themeMode;

  useEffect(() => {
    if (partyThemeId && partyThemeId !== themeId) setThemeId(partyThemeId);
  }, [partyThemeId, themeId, setThemeId]);

  useEffect(() => {
    if (partyThemeMode && partyThemeMode !== mode) setMode(partyThemeMode);
  }, [partyThemeMode, mode, setMode]);
}

/**
 * Enquanto o jogo roda, a paleta é a DELE — cada jogo tem identidade própria.
 * No lobby e depois do fim, volta o preset da party.
 *
 * Escreve nas mesmas CSS vars que o ThemeProvider, então é literalmente a
 * mesma operação de trocar de tema; nenhuma tela precisa saber disso.
 */
export function useGameIdentity(state: PartyState | null): void {
  const emJogo = !!state && state.phase !== "LOBBY";
  const gameId = state?.settings.gameId;
  const themeId = state?.settings.themeId;
  /**
   * No Advogado do Diabo cada apresentador ganha uma cor. A troca de fundo é
   * o sinal de que agora é a vez de outra pessoa.
   */
  const apresentador = gameId === "advogado-do-diabo" ? (state?.devil?.index ?? -1) : -1;

  useEffect(() => {
    const root = document.documentElement;
    const paleta =
      emJogo && apresentador >= 0
        ? presentationTheme(apresentador)
        : emJogo && gameId
          ? getGame(gameId).identity
          : themeId
            ? getPreset(themeId)
            : null;
    if (!paleta) return;

    root.style.setProperty("--tapa-accent", paleta.accent);
    root.style.setProperty("--tapa-accent-dark", paleta.accentDark);
    root.style.setProperty("--tapa-accent-soft", paleta.accentSoft);
    root.style.setProperty("--tapa-on-accent", paleta.onAccent);
    root.style.setProperty(
      "--tapa-on-accent-contrast",
      paleta.onAccent === "#ffffff" ? "#000000" : "#ffffff",
    );
  }, [emJogo, gameId, themeId, apresentador]);
}
