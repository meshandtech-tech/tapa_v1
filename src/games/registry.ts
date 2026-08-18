import { Brush, Drama, Presentation, Target, type LucideIcon } from "lucide-react";
import { DRAWING_TELEPHONE_CONFIG } from "./drawing/config";
import { GAME_IDENTITIES, type GameIdentity } from "./identity";
import type { PartyPhase } from "../party/types";

export type GameId =
  | "quem-erra-paga"
  | "advogado-do-diabo"
  | "pitch-no-escuro"
  | "drawing-telephone";

/**
 * Quanto cada fase dura antes do jogo seguir sozinho.
 *
 * É isto que faz a partida correr sem ninguém clicando: a TV lê a duração da
 * fase em que está e avança quando o prazo vence. `GAME_OVER` não aparece de
 * propósito — é onde o grupo decide o que fazer, e aí a espera é bem-vinda.
 */
export type PhaseDurations = Partial<Record<PartyPhase, number>>;

/** Tempo para responder cada pergunta. Mexa aqui para mudar o quiz inteiro. */
export const QUIZ_ANSWER_TIME = 30;
/** Tempo de preparação do Advogado do Diabo, antes de apresentar. */
export const DEVIL_PREPARATION_TIME = 50;
/** Duração da apresentação. Curto de propósito: tese difícil cansa rápido. */
export const DEVIL_PRESENTATION_TIME = 60;
/** Quantas teses aparecem na roleta a cada rodada. */
export const DEVIL_WHEEL_SIZE = 8;

const DEFAULT_DURATIONS: PhaseDurations = {
  GAME_INTRO: 6000,
  ROUND_ACTIVE: QUIZ_ANSWER_TIME * 1000,
  REVEAL_ANSWER: 6000,
  /**
   * `0` = não avança sozinha: espera o host.
   *
   * É o único ponto do quiz onde a máquina para de propósito. Enquanto o
   * pessoal cumpre a prenda, ninguém está olhando para a TV — se a rodada
   * seguinte entrasse por conta própria, todo mundo perderia a pergunta.
   */
  FORFEIT_WHEEL: 0,
  LEADERBOARD: 7000,
};

export interface GameDefinition {
  id: GameId;
  title: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
  minPlayers: number;
  /** Teto do jogo. O teto da plataforma (MAX_PLAYERS) sempre prevalece. */
  maxPlayers: number;
  /** O jogo tem roleta de prendas na fase FORFEIT_WHEEL? */
  hasForfeit: boolean;
  /** O jogo é configurável por dificuldade no lobby? */
  hasDifficulty: boolean;
  rounds: number;
  identity: GameIdentity;
  durations: PhaseDurations;
  /** Sequência de fases deste jogo. Cada fase aponta para a próxima. */
  flow: Partial<Record<PartyPhase, PartyPhase>>;
  /** Jogo ainda sem telas — aparece na seleção marcado como "em breve". */
  comingSoon?: boolean;
}

/**
 * Fluxo do Advogado do Diabo.
 *
 * O tema é sorteado ANTES do apresentador, de propósito: a sala inteira lê a
 * tese e reage, e só então descobre quem vai ter que defendê-la. Inverter isso
 * mata a piada.
 *
 * As fases com duração `0` esperam o host — são os momentos em que o grupo
 * está falando (fim de apresentação, votação, resultado).
 */
const DEVIL_FLOW: Partial<Record<PartyPhase, PartyPhase>> = {
  GAME_INTRO: "TOPIC_SPIN",
  TOPIC_SPIN: "TOPIC_REVEAL",
  TOPIC_REVEAL: "PLAYER_SPIN",
  PLAYER_SPIN: "PLAYER_REVEAL",
  PLAYER_REVEAL: "PREPARATION",
  PREPARATION: "COUNTDOWN",
  COUNTDOWN: "PRESENTATION",
  PRESENTATION: "VOTING",
  VOTING: "SCORE_REVEAL",
  // SCORE_REVEAL volta para TOPIC_SPIN ou termina — decidido no reducer.
};

const DEVIL_DURATIONS: PhaseDurations = {
  GAME_INTRO: 0, // espera o host aceitar o aviso
  TOPIC_SPIN: 7000, // a roleta gira ~5,2s e sobra respiro
  // Tempo de LER a tese e reagir. Quatro segundos não davam.
  TOPIC_REVEAL: 7000,
  PLAYER_SPIN: 4000,
  PLAYER_REVEAL: 4000,
  PREPARATION: DEVIL_PREPARATION_TIME * 1000,
  COUNTDOWN: 3200,
  PRESENTATION: DEVIL_PRESENTATION_TIME * 1000,
  VOTING: 0, // o host fecha
  SCORE_REVEAL: 0, // o host chama o próximo
};

/**
 * Fluxo do jogo de desenho.
 *
 * Declarado para o registry ficar completo, mas quem decide de fato é
 * `advanceDrawing` no reducer: `PASSING` vai para desenho OU palpite conforme
 * a paridade do passo, e um mapa de "próxima fase" não expressa isso.
 */
const DRAWING_FLOW: Partial<Record<PartyPhase, PartyPhase>> = {
  GAME_INTRO: "DRAW_STEP",
  DRAW_STEP: "PASSING",
  GUESS_STEP: "PASSING",
  REVEAL_INTRO: "REVEAL_PAGE",
};

const DRAWING_DURATIONS: PhaseDurations = {
  GAME_INTRO: 5000,
  DRAW_STEP: DRAWING_TELEPHONE_CONFIG.drawingTimeSeconds * 1000,
  GUESS_STEP: DRAWING_TELEPHONE_CONFIG.guessTimeSeconds * 1000,
  PASSING: DRAWING_TELEPHONE_CONFIG.transitionDurationMs,
  // `0` = espera o host. A revelação é o momento em que o grupo está rindo, e
  // o ritmo tem de ser humano; o auto-play sobrepõe esta duração quando ligado.
  REVEAL_INTRO: 0,
  REVEAL_PAGE: 0,
};

const QUIZ_FLOW: Partial<Record<PartyPhase, PartyPhase>> = {
  GAME_INTRO: "ROUND_ACTIVE",
  ROUND_ACTIVE: "REVEAL_ANSWER",
  // REVEAL_ANSWER escolhe entre roleta e placar conforme quem errou.
  FORFEIT_WHEEL: "LEADERBOARD",
};

export const GAMES: readonly GameDefinition[] = [
  {
    id: "quem-erra-paga",
    title: "Quem Erra, Paga",
    tagline: "Quiz + roleta de prendas",
    description:
      "Errou a pergunta? A roleta decide o seu castigo. Escolha a dificuldade e reze.",
    icon: Target,
    minPlayers: 2,
    maxPlayers: 10,
    hasForfeit: true,
    hasDifficulty: true,
    rounds: 10,
    identity: GAME_IDENTITIES["quem-erra-paga"],
    durations: DEFAULT_DURATIONS,
    flow: QUIZ_FLOW,
  },
  {
    id: "advogado-do-diabo",
    title: "Advogado do Diabo",
    tagline: "Defenda o indefensável",
    description:
      "Sorteia uma tese absurda e você tem que defender. A galera reage e dá nota.",
    icon: Drama,
    minPlayers: 2,
    maxPlayers: 10,
    hasForfeit: false,
    hasDifficulty: true,
    // Uma rodada por jogador: o número real vem do roster, não daqui.
    rounds: 10,
    identity: GAME_IDENTITIES["advogado-do-diabo"],
    durations: DEVIL_DURATIONS,
    flow: DEVIL_FLOW,
  },
  {
    id: "drawing-telephone",
    title: "Telefone Sem Fio",
    tagline: "Desenhe, adivinhe, se perca",
    description:
      "Cada um desenha uma palavra secreta e passa adiante. No fim, veja o estrago que virou.",
    icon: Brush,
    minPlayers: DRAWING_TELEPHONE_CONFIG.minPlayers,
    maxPlayers: DRAWING_TELEPHONE_CONFIG.maxPlayers,
    hasForfeit: false,
    hasDifficulty: false,
    // O número real de passos vem do roster, não daqui.
    rounds: DRAWING_TELEPHONE_CONFIG.maxPlayers,
    identity: GAME_IDENTITIES["drawing-telephone"],
    durations: DRAWING_DURATIONS,
    flow: DRAWING_FLOW,
  },
  {
    id: "pitch-no-escuro",
    title: "Pitch no Escuro",
    tagline: "Apresentação cega",
    description:
      "Slides que você nunca viu trocam sozinhos a cada 20 segundos. Boa sorte explicando.",
    icon: Presentation,
    minPlayers: 2,
    maxPlayers: 8,
    hasForfeit: false,
    hasDifficulty: false,
    rounds: 5,
    identity: GAME_IDENTITIES["pitch-no-escuro"],
    durations: { ...DEFAULT_DURATIONS, ROUND_ACTIVE: 60000 },
    flow: QUIZ_FLOW,
    comingSoon: true,
  },
] as const;

export const DEFAULT_GAME_ID: GameId = "quem-erra-paga";

export function getGame(id: GameId): GameDefinition {
  return GAMES.find((game) => game.id === id) ?? GAMES[0];
}

export function isGameId(value: unknown): value is GameId {
  return GAMES.some((game) => game.id === value);
}

/** Quanto a fase dura neste jogo. `0` = não avança sozinha. */
export function phaseDuration(id: GameId, phase: PartyPhase): number {
  return getGame(id).durations[phase] ?? 0;
}
