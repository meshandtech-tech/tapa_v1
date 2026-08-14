export type ThemeId =
  | "red-hot"
  | "emerald-green"
  | "royal-blue"
  | "cyber-yellow"
  | "neon-purple";

export interface ThemePreset {
  id: ThemeId;
  label: string;
  /** Cor de fundo vibrante do tema. */
  accent: string;
  /** Variação escura, para textos de apoio sobre papel. */
  accentDark: string;
  /** Variação clara, para faixas e estados de hover. */
  accentSoft: string;
  /**
   * Qual das duas cores duotone fica LEGÍVEL por cima do accent.
   * Não é decoração: branco sobre #FFCC00 dá ~1.5:1 e sobre #00D084 ~2:1,
   * ilegível numa TV a três metros. Cada preset declara a sua.
   */
  onAccent: "#ffffff" | "#000000";
}

/**
 * Única fonte de verdade da paleta. O ThemeProvider escreve estes valores
 * direto em document.documentElement, então não existe cópia da paleta no CSS
 * (o :root de styles.css guarda apenas o fallback do preset padrão).
 */
export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    id: "red-hot",
    label: "Red Hot",
    accent: "#e60050",
    accentDark: "#a8003a",
    accentSoft: "#ffd6e3",
    onAccent: "#ffffff",
  },
  {
    id: "emerald-green",
    label: "Emerald Green",
    accent: "#00d084",
    accentDark: "#008453",
    accentSoft: "#c6f7e4",
    onAccent: "#000000",
  },
  {
    id: "royal-blue",
    label: "Royal Blue",
    accent: "#0066ff",
    accentDark: "#0044aa",
    accentSoft: "#cfe0ff",
    onAccent: "#ffffff",
  },
  {
    id: "cyber-yellow",
    label: "Cyber Yellow",
    accent: "#ffcc00",
    accentDark: "#a88500",
    accentSoft: "#fff3c4",
    onAccent: "#000000",
  },
  {
    id: "neon-purple",
    label: "Neon Purple",
    accent: "#9900ff",
    accentDark: "#6600aa",
    accentSoft: "#e9d2ff",
    onAccent: "#ffffff",
  },
] as const;

export const DEFAULT_THEME_ID: ThemeId = "red-hot";

export function getPreset(id: ThemeId): ThemePreset {
  return THEME_PRESETS.find((preset) => preset.id === id) ?? THEME_PRESETS[0];
}

export function isThemeId(value: unknown): value is ThemeId {
  return THEME_PRESETS.some((preset) => preset.id === value);
}

/** Próximo preset do ciclo — usado pelo modo automático a cada rodada. */
export function nextThemeId(id: ThemeId): ThemeId {
  const index = THEME_PRESETS.findIndex((preset) => preset.id === id);
  return THEME_PRESETS[(index + 1) % THEME_PRESETS.length].id;
}
