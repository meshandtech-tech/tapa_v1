import { questions } from "../data/questions";
import { advanceToNextQuestion } from "./gameReducer";
import type { AnswerRecord, GameScreen, GameState, PlayerId } from "../types/game";

export const STORAGE_KEY = "despedida-game:v1";

const persistedScreens = new Set<GameScreen>([
  "question",
  "correct-feedback",
  "wrong-feedback",
  "wheel",
  "punishment-result",
  "final",
]);

function isPlayer(value: unknown): value is PlayerId {
  return value === "Lucas" || value === "Samuel";
}

function isAnswerRecord(value: unknown): value is AnswerRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<AnswerRecord>;
  return (
    Number.isInteger(record.questionIndex) &&
    Number.isInteger(record.questionId) &&
    isPlayer(record.player) &&
    (record.selectedAnswer === null || (Number.isInteger(record.selectedAnswer) && record.selectedAnswer! >= 0 && record.selectedAnswer! <= 3)) &&
    typeof record.wasCorrect === "boolean" &&
    (record.scoreDelta === 0 || record.scoreDelta === 1) &&
    typeof record.skipped === "boolean" &&
    (record.punishmentIndex === undefined || (Number.isInteger(record.punishmentIndex) && record.punishmentIndex >= 0 && record.punishmentIndex <= 11))
  );
}

function getScores(history: readonly AnswerRecord[]): Record<PlayerId, number> {
  return history.reduce<Record<PlayerId, number>>(
    (scores, record) => ({
      ...scores,
      [record.player]: scores[record.player] + record.scoreDelta,
    }),
    { Lucas: 0, Samuel: 0 },
  );
}

export function stateForPersistence(state: GameState): GameState | null {
  if (state.screen === "start") return null;
  if (state.screen === "correct-feedback") return advanceToNextQuestion(state);
  if (state.screen === "wrong-feedback") return { ...state, screen: "wheel" };
  return state;
}

export function serializeGameState(state: GameState): string | null {
  const stableState = stateForPersistence(state);
  return stableState ? JSON.stringify(stableState) : null;
}

export function parseSavedGame(raw: string | null): GameState | null {
  if (!raw) return null;

  try {
    const candidate = JSON.parse(raw) as Partial<GameState>;
    if (
      candidate.version !== 1 ||
      !candidate.screen ||
      !persistedScreens.has(candidate.screen) ||
      !Number.isInteger(candidate.currentQuestionIndex) ||
      candidate.currentQuestionIndex! < 0 ||
      candidate.currentQuestionIndex! >= questions.length ||
      !Array.isArray(candidate.history) ||
      candidate.history.length > questions.length ||
      !candidate.history.every(isAnswerRecord)
    ) {
      return null;
    }

    const history = candidate.history as AnswerRecord[];
    const historyIsSequential = history.every((record, index) => {
      const question = questions[index];
      return record.questionIndex === index && question?.id === record.questionId && question.player === record.player;
    });
    if (!historyIsSequential) return null;

    const expectsAnsweredCurrent = ["wheel", "punishment-result"].includes(candidate.screen);
    const expectedIndex = expectsAnsweredCurrent ? history.length - 1 : history.length;
    const finalIndexIsValid = candidate.screen === "final" && history.length === questions.length;
    if (!finalIndexIsValid && candidate.currentQuestionIndex !== expectedIndex) return null;

    const punishmentIndex = candidate.currentPunishmentIndex;
    if (punishmentIndex !== null && (!Number.isInteger(punishmentIndex) || punishmentIndex! < 0 || punishmentIndex! > 11)) return null;
    if (candidate.screen === "punishment-result" && punishmentIndex === null) return null;

    const currentQuestionIndex = candidate.currentQuestionIndex as number;

    return {
      version: 1,
      screen: candidate.screen,
      currentQuestionIndex,
      scores: getScores(history),
      history,
      selectedAnswer: null,
      currentPunishmentIndex: punishmentIndex ?? null,
    };
  } catch {
    return null;
  }
}

export function loadSavedGame(): GameState | null {
  if (typeof localStorage === "undefined") return null;
  return parseSavedGame(localStorage.getItem(STORAGE_KEY));
}

export function saveGameState(state: GameState): void {
  if (typeof localStorage === "undefined") return;
  const serialized = serializeGameState(state);
  if (serialized) localStorage.setItem(STORAGE_KEY, serialized);
}

export function clearSavedGame(): void {
  if (typeof localStorage !== "undefined") localStorage.removeItem(STORAGE_KEY);
}
