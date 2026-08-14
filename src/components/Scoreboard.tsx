import type { PlayerId } from "../types/game";

interface ScoreboardProps {
  scores: Record<PlayerId, number>;
  compact?: boolean;
}

/** Placar de qualquer roster: renderiza os jogadores que existirem. */
export function Scoreboard({ scores, compact = false }: ScoreboardProps) {
  const entries = Object.entries(scores);

  return (
    <section
      className={`scoreboard ${compact ? "scoreboard--compact" : ""}`}
      aria-label="Placar atual"
    >
      {entries.map(([player, score], index) => (
        <div className="scoreboard__player" key={player}>
          {index > 0 ? (
            <span className="scoreboard__versus" aria-hidden="true">
              ×
            </span>
          ) : null}
          <span>{player.toUpperCase()}</span>
          <strong>{String(score).padStart(2, "0")}</strong>
        </div>
      ))}
    </section>
  );
}
