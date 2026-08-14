import type { Difficulty } from "../party/types";

export type { Difficulty };

/** Id de jogador. Aberto de propósito: a party monta o roster em runtime. */
export type PlayerId = string;

export type QuestionOptions = readonly [string, string, string, string];

export interface Question {
  id: number;
  question: string;
  options: QuestionOptions;
  correctAnswer: 0 | 1 | 2 | 3 | null;
}

export type GameScreen =
  | "start"
  | "question"
  | "correct-feedback"
  | "wrong-feedback"
  | "wheel"
  | "punishment-result"
  | "final";

export interface AnswerRecord {
  questionIndex: number;
  questionId: number;
  player: PlayerId;
  selectedAnswer: number | null;
  wasCorrect: boolean;
  scoreDelta: 0 | 1;
  skipped: boolean;
  punishmentIndex?: number;
}

export interface GameState {
  version: 1;
  screen: GameScreen;
  /** Define qual deck de perguntas está em jogo. */
  difficulty: Difficulty;
  /** Roster da party, na ordem de entrada. O turno gira por esta lista. */
  players: PlayerId[];
  currentQuestionIndex: number;
  scores: Record<PlayerId, number>;
  history: AnswerRecord[];
  selectedAnswer: number | null;
  currentPunishmentIndex: number | null;
}
