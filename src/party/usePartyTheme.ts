import { useEffect } from "react";
import { useTheme } from "../theme/useTheme";
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
