import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ThemeContext, type ThemeMode } from "./context";
import {
  DEFAULT_THEME_ID,
  getPreset,
  isThemeId,
  type ThemeId,
  type ThemePreset,
} from "./presets";

const THEME_STORAGE_KEY = "tapa:theme";
const MODE_STORAGE_KEY = "tapa:theme-mode";

function applyPreset(preset: ThemePreset): void {
  const root = document.documentElement;
  root.dataset.theme = preset.id;
  root.style.setProperty("--tapa-accent", preset.accent);
  root.style.setProperty("--tapa-accent-dark", preset.accentDark);
  root.style.setProperty("--tapa-accent-soft", preset.accentSoft);
  root.style.setProperty("--tapa-on-accent", preset.onAccent);
  // Oposto do on-accent. É o que permite ao wordmark ter sombra visível nos
  // temas claros (cyber-yellow, emerald-green), onde o texto em si é preto.
  root.style.setProperty(
    "--tapa-on-accent-contrast",
    preset.onAccent === "#ffffff" ? "#000000" : "#ffffff",
  );

  // Mantém a barra do navegador no celular alinhada com o tema da party.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", preset.accent);
}

function readStoredTheme(): ThemeId {
  if (typeof localStorage === "undefined") return DEFAULT_THEME_ID;
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeId(stored) ? stored : DEFAULT_THEME_ID;
}

function readStoredMode(): ThemeMode {
  if (typeof localStorage === "undefined") return "manual";
  return localStorage.getItem(MODE_STORAGE_KEY) === "auto" ? "auto" : "manual";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>(readStoredTheme);
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);

  useEffect(() => {
    applyPreset(getPreset(themeId));
    localStorage.setItem(THEME_STORAGE_KEY, themeId);
  }, [themeId]);

  useEffect(() => {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  }, [mode]);

  const setThemeId = useCallback((id: ThemeId) => setThemeIdState(id), []);
  const setMode = useCallback((next: ThemeMode) => setModeState(next), []);

  const value = useMemo(
    () => ({
      theme: getPreset(themeId),
      themeId,
      mode,
      setThemeId,
      setMode,
    }),
    [themeId, mode, setThemeId, setMode],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
