import { getDeck } from "../data/questions";
import type { Difficulty } from "../party/types";
import type { AnswerRecord, GameState, PlayerId, Question } from "../types/game";

export function createGameState(
  players: readonly PlayerId[],
  difficulty: Difficulty = "medium",
): GameState {
  return {
    version: 1,
    screen: "start",
    difficulty,
    players: [...players],
    currentQuestionIndex: 0,
    scores: Object.fromEntries(players.map((player) => [player, 0])),
    history: [],
    selectedAnswer: null,
    currentPunishmentIndex: null,
  };
}

/** O turno gira pelo roster: generaliza a antiga alternância de dois jogadores. */
export function playerForQuestion(state: GameState, questionIndex: number): PlayerId | null {
  if (state.players.length === 0) return null;
  return state.players[questionIndex % state.players.length];
}

export function currentPlayer(state: GameState): PlayerId | null {
  return playerForQuestion(state, state.currentQuestionIndex);
}

export function deckFor(state: GameState): readonly Question[] {
  return getDeck(state.difficulty);
}

export function currentQuestion(state: GameState): Question | undefined {
  return deckFor(state)[state.currentQuestionIndex];
}

export type GameAction =
  | { type: "START_NEW"; players: readonly PlayerId[]; difficulty: Difficulty }
  | { type: "LOAD_GAME"; state: GameState }
  | { type: "ANSWER"; optionIndex: number }
  | { type: "FEEDBACK_COMPLETE" }
  | { type: "WHEEL_COMPLETE"; punishmentIndex: number }
  | { type: "CONTINUE_AFTER_PUNISHMENT" }
  | { type: "ADMIN_NEXT" }
  | { type: "ADMIN_BACK" };

export function advanceToNextQuestion(state: GameState): GameState {
  if (state.currentQuestionIndex >= deckFor(state).length - 1) {
    return {
      ...state,
      screen: "final",
      selectedAnswer: null,
      currentPunishmentIndex: null,
    };
  }

  return {
    ...state,
    screen: "question",
    currentQuestionIndex: state.currentQuestionIndex + 1,
    selectedAnswer: null,
    currentPunishmentIndex: null,
  };
}

function updateScore(
  scores: Record<PlayerId, number>,
  player: PlayerId,
  delta: number,
): Record<PlayerId, number> {
  return { ...scores, [player]: Math.max(0, (scores[player] ?? 0) + delta) };
}

function answerQuestion(state: GameState, optionIndex: number): GameState {
  if (state.screen !== "question" || optionIndex < 0 || optionIndex > 3) return state;
  if (state.history.some((record) => record.questionIndex === state.currentQuestionIndex)) return state;

  const question = currentQuestion(state);
  const player = currentPlayer(state);
  if (!question || player === null) return state;

  const wasCorrect = question.correctAnswer !== null && optionIndex === question.correctAnswer;
  const record: AnswerRecord = {
    questionIndex: state.currentQuestionIndex,
    questionId: question.id,
    player,
    selectedAnswer: optionIndex,
    wasCorrect,
    scoreDelta: wasCorrect ? 1 : 0,
    skipped: false,
  };

  return {
    ...state,
    screen: wasCorrect ? "correct-feedback" : "wrong-feedback",
    scores: wasCorrect ? updateScore(state.scores, player, 1) : state.scores,
    history: [...state.history, record],
    selectedAnswer: optionIndex,
    currentPunishmentIndex: null,
  };
}

function skipAndAdvance(state: GameState): GameState {
  if (state.screen === "start" || state.screen === "final") return state;

  const hasCurrentRecord = state.history.at(-1)?.questionIndex === state.currentQuestionIndex;
  let nextState = state;

  if (!hasCurrentRecord) {
    const question = currentQuestion(state);
    const player = currentPlayer(state);
    if (!question || player === null) return state;

    nextState = {
      ...state,
      history: [
        ...state.history,
        {
          questionIndex: state.currentQuestionIndex,
          questionId: question.id,
          player,
          selectedAnswer: null,
          wasCorrect: false,
          scoreDelta: 0,
          skipped: true,
        },
      ],
    };
  }

  return advanceToNextQuestion(nextState);
}

function undoLastRecord(state: GameState): GameState {
  const lastRecord = state.history.at(-1);
  if (!lastRecord) return state;

  return {
    ...state,
    screen: "question",
    currentQuestionIndex: lastRecord.questionIndex,
    scores:
      lastRecord.scoreDelta === 1
        ? updateScore(state.scores, lastRecord.player, -1)
        : state.scores,
    history: state.history.slice(0, -1),
    selectedAnswer: null,
    currentPunishmentIndex: null,
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "START_NEW":
      return { ...createGameState(action.players, action.difficulty), screen: "question" };
    case "LOAD_GAME":
      return action.state;
    case "ANSWER":
      return answerQuestion(state, action.optionIndex);
    case "FEEDBACK_COMPLETE":
      if (state.screen === "correct-feedback") return advanceToNextQuestion(state);
      if (state.screen === "wrong-feedback") return { ...state, screen: "wheel" };
      return state;
    case "WHEEL_COMPLETE": {
      if (state.screen !== "wheel" || action.punishmentIndex < 0 || action.punishmentIndex > 11) return state;
      const lastRecord = state.history.at(-1);
      if (!lastRecord || lastRecord.questionIndex !== state.currentQuestionIndex) return state;

      return {
        ...state,
        screen: "punishment-result",
        currentPunishmentIndex: action.punishmentIndex,
        history: [
          ...state.history.slice(0, -1),
          { ...lastRecord, punishmentIndex: action.punishmentIndex },
        ],
      };
    }
    case "CONTINUE_AFTER_PUNISHMENT":
      return state.screen === "punishment-result" ? advanceToNextQuestion(state) : state;
    case "ADMIN_NEXT":
      return skipAndAdvance(state);
    case "ADMIN_BACK":
      return undoLastRecord(state);
    default:
      return state;
  }
}
