export type PlayerId = "Lucas" | "Samuel";

export type QuestionOptions = readonly [string, string, string, string];

export interface Question {
  id: number;
  player: PlayerId;
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
  currentQuestionIndex: number;
  scores: Record<PlayerId, number>;
  history: AnswerRecord[];
  selectedAnswer: number | null;
  currentPunishmentIndex: number | null;
}
