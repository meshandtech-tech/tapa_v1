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
