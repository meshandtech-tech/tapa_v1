import { Drama, Presentation, Target, type LucideIcon } from "lucide-react";
import { GAME_IDENTITIES, type GameIdentity } from "./identity";
import type { PartyPhase } from "../party/types";

export type GameId = "quem-erra-paga" | "advogado-do-diabo" | "pitch-no-escuro";

/**
 * Quanto cada fase dura antes do jogo seguir sozinho.
 *
 * É isto que faz a partida correr sem ninguém clicando: a TV lê a duração da
 * fase em que está e avança quando o prazo vence. `GAME_OVER` não aparece de
 * propósito — é onde o grupo decide o que fazer, e aí a espera é bem-vinda.
 */
export type PhaseDurations = Partial<Record<PartyPhase, number>>;

const DEFAULT_DURATIONS: PhaseDurations = {
  GAME_INTRO: 6000,
  ROUND_ACTIVE: 20000,
  REVEAL_ANSWER: 6000,
  FORFEIT_WHEEL: 11000,
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
  /** Jogo ainda sem telas — aparece na seleção marcado como "em breve". */
  comingSoon?: boolean;
}

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
  },
  {
    id: "advogado-do-diabo",
    title: "Advogado do Diabo",
    tagline: "Defenda o indefensável",
    description:
      "Sorteia uma tese absurda e você tem que defender. A galera reage e dá nota.",
    icon: Drama,
    minPlayers: 3,
    maxPlayers: 10,
    hasForfeit: false,
    hasDifficulty: true,
    rounds: 6,
    identity: GAME_IDENTITIES["advogado-do-diabo"],
    durations: { ...DEFAULT_DURATIONS, ROUND_ACTIVE: 90000, REVEAL_ANSWER: 8000 },
    comingSoon: true,
  },
  {
    id: "pitch-no-escuro",
    title: "Pitch no Escuro",
    tagline: "Apresentação cega",
    description:
      "Slides que você nunca viu trocam sozinhos a cada 20 segundos. Boa sorte explicando.",
    icon: Presentation,
    minPlayers: 3,
    maxPlayers: 8,
    hasForfeit: false,
    hasDifficulty: false,
    rounds: 5,
    identity: GAME_IDENTITIES["pitch-no-escuro"],
    durations: { ...DEFAULT_DURATIONS, ROUND_ACTIVE: 60000 },
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
