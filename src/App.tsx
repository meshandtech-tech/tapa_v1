import { useEffect, useReducer, useState } from "react";
import { AdminControls } from "./components/AdminControls";
import { DecorativeHearts } from "./components/DecorativeHearts";
import { FeedbackScreen } from "./components/FeedbackScreen";
import { FinalScreen } from "./components/FinalScreen";
import { PunishmentResult } from "./components/PunishmentResult";
import { PunishmentWheel } from "./components/PunishmentWheel";
import { QuestionScreen } from "./components/QuestionScreen";
import { Scoreboard } from "./components/Scoreboard";
import { StartScreen } from "./components/StartScreen";
import { punishments } from "./data/punishments";
import { questions, validateQuestions } from "./data/questions";
import { playSound } from "./lib/sounds";
import { getUsedPunishmentIndices } from "./lib/punishmentPool";
import { gameReducer, initialGameState } from "./state/gameReducer";
import { clearSavedGame, loadSavedGame, saveGameState } from "./state/persistence";

validateQuestions(questions);

export default function App() {
  const [savedGame, setSavedGame] = useState(loadSavedGame);
  const [state, dispatch] = useReducer(gameReducer, initialGameState);

  useEffect(() => {
    if (state.screen !== "start") saveGameState(state);
  }, [state]);

  useEffect(() => {
    if (state.screen !== "correct-feedback" && state.screen !== "wrong-feedback") return;
    const delay = 2400;
    const timer = window.setTimeout(() => dispatch({ type: "FEEDBACK_COMPLETE" }), delay);
    return () => window.clearTimeout(timer);
  }, [state.screen]);

  useEffect(() => {
    if (state.screen === "final") playSound("victory");
  }, [state.screen]);

  const startNewGame = () => {
    if (savedGame && !window.confirm("Começar novamente e apagar o progresso salvo?")) return;
    clearSavedGame();
    setSavedGame(null);
    dispatch({ type: "START_NEW" });
  };

  const restartGame = () => {
    if (!window.confirm("Reiniciar o jogo e apagar todo o progresso?")) return;
    clearSavedGame();
    setSavedGame(null);
    dispatch({ type: "START_NEW" });
  };

  const answerQuestion = (optionIndex: number) => {
    const question = questions[state.currentQuestionIndex];
    if (!question || state.screen !== "question") return;
    playSound(optionIndex === question.correctAnswer ? "correct" : "wrong");
    dispatch({ type: "ANSWER", optionIndex });
  };

  const currentQuestion = questions[state.currentQuestionIndex];
  const usedPunishmentIndices = getUsedPunishmentIndices(state.history);
  const showGameChrome = state.screen !== "start" && state.screen !== "final";

  return (
    <div className="app-shell">
      <DecorativeHearts celebration={state.screen === "correct-feedback" || state.screen === "final"} />

      {showGameChrome ? <Scoreboard scores={state.scores} compact /> : null}

      {state.screen === "start" ? (
        <StartScreen
          hasSavedGame={savedGame !== null}
          onContinue={() => savedGame && dispatch({ type: "LOAD_GAME", state: savedGame })}
          onStart={startNewGame}
        />
      ) : null}

      {state.screen === "question" && currentQuestion ? (
        <QuestionScreen
          question={currentQuestion}
          questionIndex={state.currentQuestionIndex}
          totalQuestions={questions.length}
          onAnswer={answerQuestion}
        />
      ) : null}

      {state.screen === "correct-feedback" && currentQuestion && state.selectedAnswer !== null ? (
        <FeedbackScreen correct question={currentQuestion} selectedAnswer={state.selectedAnswer} />
      ) : null}
      {state.screen === "wrong-feedback" && currentQuestion && state.selectedAnswer !== null ? (
        <FeedbackScreen correct={false} question={currentQuestion} selectedAnswer={state.selectedAnswer} />
      ) : null}

      {state.screen === "wheel" ? (
        <PunishmentWheel
          usedPunishmentIndices={usedPunishmentIndices}
          onComplete={(punishmentIndex) => dispatch({ type: "WHEEL_COMPLETE", punishmentIndex })}
        />
      ) : null}

      {state.screen === "punishment-result" && state.currentPunishmentIndex !== null ? (
        <PunishmentResult
          punishment={punishments[state.currentPunishmentIndex]}
          onContinue={() => dispatch({ type: "CONTINUE_AFTER_PUNISHMENT" })}
        />
      ) : null}

      {state.screen === "final" ? <FinalScreen scores={state.scores} /> : null}

      {state.screen !== "start" ? (
        <AdminControls
          scores={state.scores}
          canGoBack={state.history.length > 0}
          canGoNext={state.screen !== "final"}
          onBack={() => dispatch({ type: "ADMIN_BACK" })}
          onNext={() => dispatch({ type: "ADMIN_NEXT" })}
          onRestart={restartGame}
        />
      ) : null}
    </div>
  );
}
