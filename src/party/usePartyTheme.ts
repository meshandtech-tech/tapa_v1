import { useEffect } from "react";
import { playerTheme, presentationTheme } from "../games/identity";
import { getGame } from "../games/registry";
import { useTheme } from "../theme/useTheme";
import { getPreset } from "../theme/presets";
import type { PartyState, Player } from "./types";

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
export function useGameIdentity(state: PartyState | null, me: Player | null = null): void {
  const emJogo = !!state && state.phase !== "LOBBY";
  const gameId = state?.settings.gameId;
  const themeId = state?.settings.themeId;
  /**
   * No Advogado do Diabo cada apresentador ganha uma cor. A troca de fundo é
   * o sinal de que agora é a vez de outra pessoa.
   */
  const apresentador = gameId === "advogado-do-diabo" ? (state?.devil?.index ?? -1) : -1;
  /**
   * No jogo de desenho a cor é PESSOAL: enquanto eu desenho, a tela é da minha
   * cor — eu me reconheço no meu ambiente. Na revelação passa a ser a cor de
   * quem fez aquela página, e é isso que deixa o caminho do caderno legível de
   * relance: dá para ver o desenho trocando de mão pela troca de cor.
   */
  const corPessoal = drawingColor(state, me);

  useEffect(() => {
    const root = document.documentElement;
    const paleta =
      emJogo && corPessoal
        ? playerTheme(corPessoal)
        : emJogo && apresentador >= 0
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
  }, [emJogo, gameId, themeId, apresentador, corPessoal]);
}

/** De quem é a cor da tela agora, no jogo de desenho. `null` = usa a do jogo. */
function drawingColor(state: PartyState | null, me: Player | null): string | null {
  if (!state || state.settings.gameId !== "drawing-telephone" || !state.drawing) return null;

  if (state.phase === "DRAW_STEP" || state.phase === "GUESS_STEP" || state.phase === "PASSING") {
    return me?.color ?? null;
  }

  if (state.phase === "REVEAL_PAGE") {
    const chain = state.drawing.chains[state.drawing.revealChainIndex];
    // A página 0 é o tema original, que não tem autor — ali vale a cor do dono.
    if (state.drawing.revealPageIndex === 0) {
      return state.players.find((player) => player.id === chain?.ownerPlayerId)?.color ?? null;
    }
    const page = chain?.pages[state.drawing.revealPageIndex - 1];
    if (!page) return null;
    return state.players.find((player) => player.id === page.playerId)?.color ?? null;
  }

  return null;
}
