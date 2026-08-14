import type { PlayerId } from "../types/game";

interface AdminControlsProps {
  scores: Record<PlayerId, number>;
  canGoBack: boolean;
  canGoNext: boolean;
  onBack: () => void;
  onNext: () => void;
  onRestart: () => void;
}

export function AdminControls({ scores, canGoBack, canGoNext, onBack, onNext, onRestart }: AdminControlsProps) {
  const line = Object.entries(scores)
    .map(([player, score]) => `${player.toUpperCase()} ${score}`)
    .join("  ×  ");

  return (
    <details className="admin-controls">
      <summary aria-label="Abrir controles do jogo">•••</summary>
      <div className="admin-controls__panel">
        <p>CONTROLE DO JOGO</p>
        <div className="admin-controls__score">{line}</div>
        <div className="admin-controls__actions">
          <button type="button" onClick={onBack} disabled={!canGoBack}>← VOLTAR</button>
          <button type="button" onClick={onNext} disabled={!canGoNext}>AVANÇAR →</button>
        </div>
        <button className="admin-controls__restart" type="button" onClick={onRestart}>REINICIAR JOGO</button>
      </div>
    </details>
  );
}
