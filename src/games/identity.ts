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
  /**
   * Caderno de rascunho: papel off-white e tipografia preta.
   *
   * Único jogo de fundo claro no acervo, de propósito — o desenho da pessoa é
   * o conteúdo, e fundo saturado brigaria com ele. Também é o que faz a cor de
   * cada jogador (§ playerTheme) aparecer, em vez de sumir contra o fundo.
   */
  "drawing-telephone": {
    accent: "#f2ebdb",
    accentDark: "#4a3f2c",
    accentSoft: "#ffffff",
    onAccent: "#000000",
    pattern: "zine-noise",
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


/**
 * Paleta derivada da cor de identidade de um jogador.
 *
 * Cada pessoa tem a própria cor desde o lobby (`Player.color`, garantida única
 * pelo `nextAvailableColor`), mas ela só aparecia num anelzinho de avatar.
 * Aqui essa cor vira o ambiente inteiro da pessoa — e, na revelação, a cor de
 * cada página. É o que deixa o caminho do caderno legível de relance: dá para
 * ver o desenho passando de mão em mão pela troca de cor.
 */
export function playerTheme(color: string): GameIdentity {
  return {
    accent: color,
    accentDark: shiftLightness(color, -0.28),
    accentSoft: shiftLightness(color, 0.42),
    onAccent: readableInk(color),
    pattern: "zine-grain",
  };
}

/** Clareia (positivo) ou escurece (negativo) um hex, sem sair da faixa. */
function shiftLightness(hex: string, amount: number): string {
  const { r, g, b } = parseHex(hex);
  const mix = (canal: number) =>
    Math.round(amount >= 0 ? canal + (255 - canal) * amount : canal * (1 + amount));
  return `#${[mix(r), mix(g), mix(b)].map((v) => clampByte(v).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Preto ou branco sobre esta cor, pelo que se LÊ melhor.
 *
 * As cores de jogador vão de amarelo-limão a roxo escuro; fixar uma cor de
 * texto deixaria metade da sala com tela ilegível. A luminância relativa é a
 * mesma conta que o WCAG usa para contraste.
 */
export function readableInk(hex: string): "#ffffff" | "#000000" {
  const { r, g, b } = parseHex(hex);
  const canal = (valor: number) => {
    const s = valor / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminancia = 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
  return luminancia > 0.45 ? "#000000" : "#ffffff";
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const limpo = hex.replace("#", "");
  const cheio = limpo.length === 3 ? limpo.split("").map((c) => c + c).join("") : limpo;
  const numero = Number.parseInt(cheio, 16);
  if (!Number.isFinite(numero) || cheio.length !== 6) return { r: 0, g: 0, b: 0 };
  return { r: (numero >> 16) & 255, g: (numero >> 8) & 255, b: numero & 255 };
}

const clampByte = (valor: number) => Math.max(0, Math.min(255, valor));
