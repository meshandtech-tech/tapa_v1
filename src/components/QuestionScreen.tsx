import type { Question } from "../types/game";
import { AnswerButton } from "./AnswerButton";

interface QuestionScreenProps {
  question: Question;
  questionIndex: number;
  totalQuestions: number;
  onAnswer: (index: number) => void;
}

export function QuestionScreen({ question, questionIndex, totalQuestions, onAnswer }: QuestionScreenProps) {
  const isLongQuestion = question.question.length > 72;

  return (
    <main className="screen question-screen">
      <article className={`question-card ${isLongQuestion ? "question-card--long" : ""}`} key={question.id}>
        <header className="question-card__header">
          <span>PERGUNTA {String(questionIndex + 1).padStart(2, "0")} / {totalQuestions}</span>
          <span>AGORA É COM VOCÊ, <strong>{question.player.toUpperCase()}</strong></span>
        </header>
        <div className="question-card__body">
          <h1>{question.question}</h1>
          <div className="answer-grid">
            {question.options.map((option, index) => (
              <AnswerButton key={`${question.id}-${index}`} index={index} text={option} onSelect={onAnswer} />
            ))}
          </div>
        </div>
      </article>
    </main>
  );
}
