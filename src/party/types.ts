import type { GameId } from "../games/registry";
import type { ThemeMode } from "../theme/context";
import type { ThemeId } from "../theme/presets";

export type { GameId, ThemeId, ThemeMode };

export type Difficulty = "easy" | "medium" | "hard";

export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Fácil",
  medium: "Médio",
  hard: "Difícil",
};

/**
 * Ciclo de vida de uma party. A ordem aqui é a ordem real do jogo.
 */
/**
 * Fases da party. `LOBBY`, `GAME_INTRO`, `LEADERBOARD` e `GAME_OVER` são
 * comuns a todos os jogos; as demais pertencem a um jogo específico e o
 * registry declara quais transições cada um permite.
 */
export type PartyPhase =
  // Comuns
  | "LOBBY"
  | "GAME_INTRO"
  | "LEADERBOARD"
  | "GAME_OVER"
  // Quem Erra, Paga
  | "ROUND_ACTIVE"
  | "REVEAL_ANSWER"
  | "FORFEIT_WHEEL"
  // Advogado do Diabo
  | "TOPIC_SPIN"
  | "TOPIC_REVEAL"
  | "PLAYER_SPIN"
  | "PLAYER_REVEAL"
  | "PREPARATION"
  | "COUNTDOWN"
  | "PRESENTATION"
  | "VOTING"
  | "SCORE_REVEAL";

/**
 * Cores de identidade dos jogadores — marcadores de fanzine.
 * Sempre usadas com borda preta grossa, então funcionam sobre qualquer tema.
 */
export const PLAYER_COLORS: readonly string[] = [
  "#ff5c8a",
  "#ffb703",
  "#3ddc97",
  "#4cc9f0",
  "#b892ff",
  "#ff8c42",
  "#06d6a0",
  "#ef476f",
  "#8ecae6",
  "#c9ff4c",
];

/** Teto absoluto da plataforma. Nenhum jogo nem host passa disto. */
export const MAX_PLAYERS = 10;
export const NICKNAME_MAX_LENGTH = 14;

export interface Player {
  id: string;
  nickname: string;
  color: string;
  /** Semente do avatar Open Peeps. Determinística: mesmo seed, mesmo rosto. */
  avatarSeed: string;
  score: number;
  joinedAt: number;
}

export interface PartySettings {
  gameId: GameId;
  difficulty: Difficulty;
  /**
   * Tema da party. Vive no estado — e não no localStorage de cada aparelho —
   * porque a TV e os celulares têm de mostrar a MESMA cor. O host é a
   * autoridade; o `STATE` broadcast leva a cor para todo mundo.
   */
  themeId: ThemeId;
  /** `auto` gira o preset a cada entrada em ROUND_ACTIVE. */
  themeMode: ThemeMode;
}

/**
 * Estado do "Quem Erra, Paga". Todo mundo responde a MESMA pergunta ao mesmo
 * tempo — não há rodízio de turno.
 *
 * O prazo da rodada NÃO mora aqui: virou `phaseDeadline` no estado da party,
 * porque toda fase passou a ter prazo próprio (auto-host).
 */
export interface QuizState {
  /** Ordem sorteada das perguntas desta partida (índices no deck). */
  order: number[];
  /** Resposta da rodada corrente: id do jogador → índice da alternativa. */
  answers: Record<string, number>;
  /** Prenda sorteada para quem errou. Definida ao entrar em FORFEIT_WHEEL. */
  punishmentIndex: number | null;
}

/** Tese escrita pelo host, opcionalmente dedicada a alguém da sala. */
export interface CustomTopic {
  id: string;
  text: string;
  /** Id do jogador a quem o tema se refere. Opcional. */
  aboutPlayerId?: string;
}

export const MAX_CUSTOM_TOPICS = 10;

/** Estado do "Advogado do Diabo". */
export interface DevilState {
  /** Ordem de apresentação, sorteada no início. Cada um apresenta uma vez. */
  order: string[];
  /** Posição em `order`. -1 = ainda não começou nenhuma rodada. */
  index: number;
  /** Ids de tema mostrados na roleta desta rodada. */
  candidates: string[];
  /** Índice do vencedor dentro de `candidates`. */
  winner: number;
  /** Temas já sorteados ou recusados — não voltam nesta partida. */
  usedTopics: string[];
  /** Teses escritas pelo host, misturadas com prioridade às do sistema. */
  customTopics: CustomTopic[];
  /** Votos da rodada corrente: id de quem votou → nota de 1 a 5. */
  votes: Record<string, number>;
  /** Nota final de cada apresentador, já calculada. */
  scores: Record<string, number>;
  /** O grupo já aceitou o aviso inicial? */
  disclaimerAccepted: boolean;
}

export interface PartyState {
  version: 1;
  pin: string;
  phase: PartyPhase;
  players: Player[];
  settings: PartySettings;
  /** Rodada atual, base 1. Vale 0 enquanto a party está no lobby. */
  round: number;
  createdAt: number;
  /** Preenchido em START_GAME; volta a null ao retornar ao lobby. */
  quiz: QuizState | null;
  /** Idem, para o "Advogado do Diabo". Só um dos dois vive por vez. */
  devil: DevilState | null;
  /**
   * Quem manda na sala. O host é um jogador como os outros — joga, pontua —
   * e só ganha um painel de controles no próprio celular.
   * `null` enquanto ninguém reivindicou.
   */
  hostPlayerId: string | null;
  /**
   * Instante em que a fase atual expira e o jogo segue sozinho.
   * `0` = fase sem prazo (LOBBY e GAME_OVER esperam decisão humana).
   */
  phaseDeadline: number;
  /** Instante em que o host pausou. `null` = correndo. */
  pausedAt: number | null;
}
