import type { Difficulty } from "../party/types";

export type { Difficulty };

/** Id de jogador. Aberto de propósito: a party monta o roster em runtime. */
export type PlayerId = string;

export type QuestionOptions = readonly [string, string, string, string];

export interface Question {
  id: number;
  question: string;
  options: QuestionOptions;
  /** `null` = pegadinha: nenhuma alternativa está certa e todo mundo paga. */
  correctAnswer: 0 | 1 | 2 | 3 | null;
}
