import { Drama, Presentation, Target, type LucideIcon } from "lucide-react";

export type GameId = "quem-erra-paga" | "advogado-do-diabo" | "pitch-no-escuro";

export interface GameDefinition {
  id: GameId;
  title: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
  minPlayers: number;
  maxPlayers: number;
  /** O jogo tem roleta de prendas na fase FORFEIT_WHEEL? */
  hasForfeit: boolean;
  /** O jogo é configurável por dificuldade no lobby? */
  hasDifficulty: boolean;
  rounds: number;
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
  },
  {
    id: "advogado-do-diabo",
    title: "Advogado do Diabo",
    tagline: "Pitch absurdo em 1:30",
    description:
      "Sorteia uma tese bizarra e você tem um minuto e meio para defender. A galera reage e dá nota.",
    icon: Drama,
    minPlayers: 3,
    maxPlayers: 10,
    hasForfeit: false,
    hasDifficulty: false,
    rounds: 6,
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
  },
] as const;

export const DEFAULT_GAME_ID: GameId = "quem-erra-paga";

export function getGame(id: GameId): GameDefinition {
  return GAMES.find((game) => game.id === id) ?? GAMES[0];
}

export function isGameId(value: unknown): value is GameId {
  return GAMES.some((game) => game.id === value);
}
