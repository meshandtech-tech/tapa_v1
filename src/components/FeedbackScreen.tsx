import type { Question } from "../types/game";

interface FeedbackScreenProps {
  correct: boolean;
  question: Question;
  selectedAnswer: number;
}

const answerLetters = ["A", "B", "C", "D"] as const;

export function FeedbackScreen({ correct, question, selectedAnswer }: FeedbackScreenProps) {
  const correctAnswer = question.correctAnswer;
  const correctAnswerText = correctAnswer === null
    ? "NENHUMA DAS ALTERNATIVAS"
    : `${answerLetters[correctAnswer]} — ${question.options[correctAnswer]}`;

  return (
    <main className={`screen feedback-screen ${correct ? "feedback-screen--correct" : "feedback-screen--wrong"}`}>
      <div className="feedback-card" role="status" aria-live="assertive">
        <span className="feedback-card__icon" aria-hidden="true">{correct ? "♥" : "×"}</span>
        <h1>{correct ? "ACERTOU, MISERÁVEL!" : "ERROU!"}</h1>
        <p>{correct ? "ELE REALMENTE CONHECE A NOIVA!" : "VAI CASAR COM ELA E NÃO SABE ISSO?"}</p>
        <div className="feedback-card__answers">
          <div>
            <span>SUA RESPOSTA</span>
            <strong>{answerLetters[selectedAnswer]} — {question.options[selectedAnswer]}</strong>
          </div>
          <div className="feedback-card__correct-answer">
            <span>RESPOSTA CERTA</span>
            <strong>{correctAnswerText}</strong>
          </div>
        </div>
      </div>
      {correct ? <div className="heart-burst" aria-hidden="true">♥ ♥ ♥ ♥ ♥</div> : null}
    </main>
  );
}
