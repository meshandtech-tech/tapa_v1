const letters = ["A", "B", "C", "D"] as const;

interface AnswerButtonProps {
  index: number;
  text: string;
  onSelect: (index: number) => void;
}

export function AnswerButton({ index, text, onSelect }: AnswerButtonProps) {
  return (
    <button className="answer-button" type="button" onClick={() => onSelect(index)}>
      <span className="answer-button__letter">{letters[index]}</span>
      <span className="answer-button__text">{text}</span>
    </button>
  );
}
