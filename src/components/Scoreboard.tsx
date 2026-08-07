import type { PlayerId } from "../types/game";

interface ScoreboardProps {
  scores: Record<PlayerId, number>;
  compact?: boolean;
}

export function Scoreboard({ scores, compact = false }: ScoreboardProps) {
  return (
    <section className={`scoreboard ${compact ? "scoreboard--compact" : ""}`} aria-label="Placar atual">
      <div className="scoreboard__player">
        <span>LUCAS</span>
        <strong>{String(scores.Lucas).padStart(2, "0")}</strong>
      </div>
      <span className="scoreboard__versus" aria-hidden="true">×</span>
      <div className="scoreboard__player">
        <span>SAMUEL</span>
        <strong>{String(scores.Samuel).padStart(2, "0")}</strong>
      </div>
    </section>
  );
}
