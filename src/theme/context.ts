import { createContext } from "react";
import { DEFAULT_THEME_ID, getPreset, type ThemeId, type ThemePreset } from "./presets";

/** `manual` = o Host escolhe. `auto` = troca sozinho a cada rodada/pergunta. */
export type ThemeMode = "manual" | "auto";

/**
 * Este contexto é a camada de PINTURA — ele aplica um preset ao documento.
 * Quem decide a cor durante uma party é o `partyReducer` (a rotação do modo
 * `auto` acontece lá, e chega aqui via `usePartyTheme`). Fora de uma sala,
 * a escolha é local e persistida no localStorage.
 */
export interface ThemeContextValue {
  theme: ThemePreset;
  themeId: ThemeId;
  mode: ThemeMode;
  setThemeId: (id: ThemeId) => void;
  setMode: (mode: ThemeMode) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: getPreset(DEFAULT_THEME_ID),
  themeId: DEFAULT_THEME_ID,
  mode: "manual",
  setThemeId: () => {},
  setMode: () => {},
});
