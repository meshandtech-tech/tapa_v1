/**
 * Identidade visual de cada jogo.
 *
 * Usa exatamente as MESMAS CSS vars que o Theme Engine da party
 * (`--tapa-accent` e companhia), então aplicar uma identidade é a mesma
 * operação que trocar de preset — sem cor hardcoded espalhada pelas telas.
 *
 * Vale enquanto o jogo está em andamento; no lobby volta o preset da party.
 */
export interface GameIdentity {
  accent: string;
  accentDark: string;
  accentSoft: string;
  /** Cor da tipografia sobre o accent. Preto quando o fundo é claro. */
  onAccent: "#ffffff" | "#000000";
  /** Textura de fundo da tela do jogo. Classe utilitária de styles.css. */
  pattern: "zine-grain" | "zine-flames" | "zine-dots" | "zine-noise";
}

export const GAME_IDENTITIES = {
  "quem-erra-paga": {
    accent: "#e60050",
    accentDark: "#a8003a",
    accentSoft: "#ffd6e3",
    onAccent: "#ffffff",
    pattern: "zine-grain",
  },
  // Vermelho mais escuro e fogo: debate, cartaz, caos.
  "advogado-do-diabo": {
    accent: "#c1121f",
    accentDark: "#780000",
    accentSoft: "#ffd7d7",
    onAccent: "#ffffff",
    pattern: "zine-flames",
  },
  "pitch-no-escuro": {
    accent: "#0066ff",
    accentDark: "#0044aa",
    accentSoft: "#cfe0ff",
    onAccent: "#ffffff",
    pattern: "zine-dots",
  },
  // Votação, reality show. Fundo claro pede tipografia preta.
  "quem-faria-isso": {
    accent: "#ffc300",
    accentDark: "#a07400",
    accentSoft: "#fff3c4",
    onAccent: "#000000",
    pattern: "zine-dots",
  },
  // Segredo, after party.
  "confessa-ou-paga": {
    accent: "#7b2cbf",
    accentDark: "#3c096c",
    accentSoft: "#e9d2ff",
    onAccent: "#ffffff",
    pattern: "zine-noise",
  },
} as const satisfies Record<string, GameIdentity>;

export type GameIdentityId = keyof typeof GAME_IDENTITIES;

/**
 * Paletas de apresentação do Advogado do Diabo.
 *
 * Cada apresentador recebe uma cor diferente — a troca de fundo é o sinal
 * visual de que agora é a vez de outra pessoa. Lista fixa e conferida, nunca
 * cor gerada na hora: com aleatório sai combinação ilegível.
 */
export const PRESENTATION_THEMES: readonly GameIdentity[] = [
  { accent: "#c1121f", accentDark: "#780000", accentSoft: "#ffd7d7", onAccent: "#ffffff", pattern: "zine-flames" },
  { accent: "#0066ff", accentDark: "#003d99", accentSoft: "#cfe0ff", onAccent: "#ffffff", pattern: "zine-dots" },
  { accent: "#7b2cbf", accentDark: "#3c096c", accentSoft: "#e9d2ff", onAccent: "#ffffff", pattern: "zine-noise" },
  { accent: "#087f5b", accentDark: "#02523a", accentSoft: "#c3fae8", onAccent: "#ffffff", pattern: "zine-grain" },
  { accent: "#f77f00", accentDark: "#9c5000", accentSoft: "#ffe8cc", onAccent: "#000000", pattern: "zine-dots" },
  { accent: "#d6006e", accentDark: "#8a0047", accentSoft: "#ffd6ea", onAccent: "#ffffff", pattern: "zine-grain" },
  { accent: "#1d3557", accentDark: "#0d1b2a", accentSoft: "#d0dcf0", onAccent: "#ffffff", pattern: "zine-noise" },
  { accent: "#00b4a6", accentDark: "#00706a", accentSoft: "#c8fff9", onAccent: "#000000", pattern: "zine-dots" },
];

/** Paleta da vez. Cicla pela lista, então nunca repete em seguida. */
export function presentationTheme(index: number): GameIdentity {
  if (index < 0) return PRESENTATION_THEMES[0];
  return PRESENTATION_THEMES[index % PRESENTATION_THEMES.length];
}
